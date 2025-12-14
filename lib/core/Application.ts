import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'node:path';
import { createServer, Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { NodeWireManager } from '../nodewire/NodeWireManager';
import { Router } from './Router';

export interface ApplicationConfig {
    viewsPath?: string;
    publicPath?: string;
    staticPath?: string;
    controllersPath?: string;
    modelsPath?: string;
    basePath?: string;
}

export class Application {
    private app: Express;
    private httpServer: HttpServer | null = null;
    private wss: WebSocketServer | null = null;
    private nodeWireManager: NodeWireManager;
    private config: ApplicationConfig;

    constructor(config: ApplicationConfig = {}) {
        this.app = express();
        this.nodeWireManager = new NodeWireManager();
        
        // Configurar rutas por defecto basadas en process.cwd()
        const basePath = config.basePath || process.cwd();
        this.config = {
            viewsPath: config.viewsPath || path.join(basePath, 'resources/views'),
            publicPath: config.publicPath || path.join(basePath, 'public'),
            staticPath: config.staticPath || path.join(basePath, 'public'),
            controllersPath: config.controllersPath || path.join(basePath, 'app/controllers'),
            modelsPath: config.modelsPath || path.join(basePath, 'app/models'),
            basePath: basePath
        };
        
        this.setupMiddleware();
        this.setupViewEngine();
        this.setupNodeWire();
    }

    private setupMiddleware(): void {
        // Parsear JSON
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Servir archivos estáticos
        this.app.use(express.static(this.config.staticPath!));

        // Exponer NodeWireManager en app.locals para que los controladores puedan acceder
        this.app.locals.nodeWireManager = this.nodeWireManager;

        // Helper para renderizar vistas
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            res.render = (view: string, data: any = {}) => {
                const viewPath = path.join(this.config.viewsPath!, `${view}.ejs`);
                const ejs = require('ejs');
                
                // Agregar helpers de NodeWire para que estén disponibles en includes
                const nodewireHelpers = {
                    nodewireState: (comp: any) => {
                        return `<script type="application/json" data-nodewire-state="${comp.id}" data-component-name="${comp.name}">${JSON.stringify(comp.getState())}</script>`;
                    },
                    nodewireId: (comp: any) => {
                        return comp.id;
                    },
                    nodewireComponent: (comp: any) => {
                        return comp.name;
                    },
                    // Helper para marcar automáticamente elementos con propiedades del componente
                    // Busca el componente en data (puede estar como component, counterComponent, etc.)
                    wire: (prop: string, content: any) => {
                        // Buscar componente en data - puede estar con diferentes nombres
                        let component = data.component || 
                                      data.counterComponent ||
                                      (data as any).component;
                        
                        // Si aún no lo encontramos, buscar cualquier propiedad que tenga 'id' y 'name'
                        if (!component) {
                            for (const key in data) {
                                const value = (data as any)[key];
                                if (value && typeof value === 'object' && 'id' in value && 'name' in value && 'getState' in value) {
                                    component = value;
                                    console.log(`[NodeWire] Componente encontrado en data.${key}`);
                                    break;
                                }
                            }
                        }
                        
                        if (!component) {
                            console.warn('[NodeWire] wire() llamado sin componente disponible. Data keys:', Object.keys(data));
                            return String(content || '');
                        }
                        
                        const contentStr = String(content || '');
                        const html = `<span data-nodewire-id="${component.id}" data-nodewire-prop="${prop}">${contentStr}</span>`;
                        console.log(`[NodeWire] wire() generado (render inicial):`, html.substring(0, 100));
                        return html;
                    }
                };
                
                ejs.renderFile(
                    viewPath, 
                    { ...data, ...nodewireHelpers, req, res }, 
                    {
                        filename: viewPath,
                        root: this.config.viewsPath!
                    },
                    (err: Error | null, html: string) => {
                        if (err) {
                            console.error('Error renderizando vista:', err);
                            return res.status(500).send('Error interno del servidor');
                        }
                        res.send(html);
                    }
                );
            };
            next();
        });
    }

    private setupViewEngine(): void {
        this.app.set('view engine', 'ejs');
        this.app.set('views', this.config.viewsPath!);
        
        // Configurar EJS para que los helpers estén disponibles en includes
        const ejs = require('ejs');
        // Los helpers se agregarán en el método render
    }

    private setupNodeWire(): void {
        // Endpoint HTTP para compatibilidad (fallback)
        this.app.post('/nodewire/call', async (req: Request, res: Response) => {
            try {
                const { id, component, method, state } = req.body;
                
                const result = await this.nodeWireManager.handleComponentCall(
                    id,
                    component,
                    method,
                    state,
                    this.config.viewsPath
                );

                res.json(result);
            } catch (error: any) {
                console.error('Error en NodeWire:', error);
                res.json({
                    success: false,
                    error: error.message || 'Error desconocido'
                });
            }
        });
    }

    private setupWebSocket(): void {
        if (!this.httpServer) {
            throw new Error('HTTP server must be created before WebSocket server');
        }

        this.wss = new WebSocketServer({ 
            server: this.httpServer,
            path: '/nodewire/ws'
        });

        this.wss.on('connection', (ws: WebSocket) => {
            console.log('[NodeWire] Cliente WebSocket conectado');

            ws.on('message', async (message: string) => {
                try {
                    const data = JSON.parse(message.toString());
                    const { id, component, method, state, requestId } = data;

                    const result = await this.nodeWireManager.handleComponentCall(
                        id,
                        component,
                        method,
                        state,
                        this.config.viewsPath
                    );

                    // Enviar respuesta con el requestId para que el cliente pueda hacer match
                    ws.send(JSON.stringify({
                        ...result,
                        requestId
                    }));
                } catch (error: any) {
                    console.error('[NodeWire] Error procesando mensaje WebSocket:', error);
                    ws.send(JSON.stringify({
                        success: false,
                        error: error.message || 'Error desconocido'
                    }));
                }
            });

            ws.on('close', () => {
                console.log('[NodeWire] Cliente WebSocket desconectado');
            });

            ws.on('error', (error: Error) => {
                console.error('[NodeWire] Error en WebSocket:', error);
            });
        });
    }

    public use(router: any): void {
        if (router instanceof Router) {
            this.app.use(router.getRouter());
        } else {
            this.app.use(router);
        }
    }

    public listen(port: number, callback?: () => void): void {
        // Crear servidor HTTP
        this.httpServer = createServer(this.app);
        
        // Configurar WebSocket
        this.setupWebSocket();
        
        // Iniciar servidor
        this.httpServer.listen(port, () => {
            console.log(`[NodeWire] WebSocket server disponible en ws://localhost:${port}/nodewire/ws`);
            if (callback) callback();
        });
    }

    public getApp(): Express {
        return this.app;
    }

    public getNodeWireManager(): NodeWireManager {
        return this.nodeWireManager;
    }
}

