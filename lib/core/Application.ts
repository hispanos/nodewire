import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'node:path';
import { NodeWireManager } from '../nodewire/NodeWireManager';
import { Router } from './Router';

export interface ApplicationConfig {
    viewsPath?: string;
    publicPath?: string;
    staticPath?: string;
}

export class Application {
    private app: Express;
    private nodeWireManager: NodeWireManager;
    private config: ApplicationConfig;

    constructor(config: ApplicationConfig = {}) {
        this.app = express();
        this.nodeWireManager = new NodeWireManager();
        this.config = config;
        this.setupMiddleware();
        this.setupViewEngine();
        this.setupNodeWire();
    }

    private setupMiddleware(): void {
        // Parsear JSON
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Servir archivos estáticos
        const staticPath = this.config.staticPath || this.config.publicPath || path.join(process.cwd(), 'public');
        this.app.use(express.static(staticPath));

        // Helper para renderizar vistas
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            res.render = (view: string, data: any = {}) => {
                const viewsPath = this.config.viewsPath || path.join(process.cwd(), 'resources/views');
                const viewPath = path.join(viewsPath, `${view}.ejs`);
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
                        root: viewsPath
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
        const viewsPath = this.config.viewsPath || path.join(process.cwd(), 'resources/views');
        this.app.set('view engine', 'ejs');
        this.app.set('views', viewsPath);
        
        // Configurar EJS para que los helpers estén disponibles en includes
        const ejs = require('ejs');
        // Los helpers se agregarán en el método render
    }

    private setupNodeWire(): void {
        // Endpoint para las llamadas de NodeWire
        this.app.post('/nodewire/call', async (req: Request, res: Response) => {
            try {
                const { id, component, method, state } = req.body;
                
                const result = await this.nodeWireManager.handleComponentCall(
                    id,
                    component,
                    method,
                    state,
                    this.config.viewsPath || path.join(process.cwd(), 'resources/views')
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

    public use(router: any): void {
        if (router instanceof Router) {
            this.app.use(router.getRouter());
        } else {
            this.app.use(router);
        }
    }

    public listen(port: number, callback?: () => void): void {
        this.app.listen(port, callback);
    }

    public getApp(): Express {
        return this.app;
    }

    public getNodeWireManager(): NodeWireManager {
        return this.nodeWireManager;
    }
}

