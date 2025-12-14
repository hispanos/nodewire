import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'node:path';
import { createServer, Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { NodeWireManager } from '../nodewire/NodeWireManager';
import { Router } from './Router';
import { create } from 'express-handlebars';
import Handlebars from 'handlebars';

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

        // Interceptar res.render para aplicar auto-marcado de NodeWire
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            const originalRender = res.render.bind(res);
            
            (res as any).render = (view: string, data: any = {}, callback?: (err: Error, html: string) => void) => {
                // Llamar al render original
                originalRender(view, data, (err: Error, html: string) => {
                    if (err) {
                        if (callback) callback(err, '');
                        return;
                    }
                    
                    if (html) {
                        // Post-procesar el HTML para aplicar auto-marcado de NodeWire
                        // Buscar componentes en los datos pasados a la vista
                        let processedHtml = html;
                        
                        // Buscar cualquier componente en los datos
                        let component: any = null;
                        if (data) {
                            for (const key in data) {
                                const value = (data as any)[key];
                                if (value && typeof value === 'object' && 'id' in value && 'name' in value && 'getState' in value) {
                                    component = value;
                                    break;
                                }
                            }
                        }
                        
                        if (component) {
                            processedHtml = this.nodeWireManager.autoMarkComponentProperties(processedHtml, component);
                        }
                        
                        if (callback) {
                            callback(err, processedHtml);
                        } else {
                            res.send(processedHtml);
                        }
                    } else {
                        if (callback) callback(err, '');
                    }
                });
            };
            
            next();
        });
    }

    private setupViewEngine(): void {
        // Configurar Handlebars
        const hbs = create({
            extname: '.hbs',
            defaultLayout: false as any,
            partialsDir: this.config.viewsPath!,
            helpers: {
                // Helper para generar el estado de NodeWire
                nodewireState: (comp: any) => {
                    return new Handlebars.SafeString(
                        `<script type="application/json" data-nodewire-state="${comp.id}" data-component-name="${comp.name}">${JSON.stringify(comp.getState())}</script>`
                    );
                },
                // Helper para obtener el ID del componente
                nodewireId: (comp: any) => {
                    return comp.id;
                },
                // Helper para obtener el nombre del componente
                nodewireComponent: (comp: any) => {
                    return comp.name;
                },
                // Helper para marcar automáticamente elementos con propiedades del componente
                // Uso: {{wire 'count' component.count}}
                wire: (prop: string, content: any, options: any) => {
                    // En Handlebars, los helpers reciben los argumentos de forma diferente
                    // options.data.root contiene el contexto completo
                    const data = options.data ? options.data.root : options;
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
                        return new Handlebars.SafeString(String(content || ''));
                    }
                    
                    const contentStr = String(content || '');
                    const html = `<span data-nodewire-id="${component.id}" data-nodewire-prop="${prop}">${contentStr}</span>`;
                    console.log(`[NodeWire] wire() generado (render inicial):`, html.substring(0, 100));
                    return new Handlebars.SafeString(html);
                }
            }
        });
        
        this.app.engine('.hbs', hbs.engine);
        this.app.set('view engine', '.hbs');
        this.app.set('views', this.config.viewsPath!);
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
            // Configurar NodeWireManager en el Router si no lo tiene
            if (!(router as any).nodeWireManager) {
                (router as any).setNodeWireManager(this.nodeWireManager);
            }
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

