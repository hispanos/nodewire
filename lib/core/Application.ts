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
                    nodewireState: (component: any) => {
                        return `<script type="application/json" data-nodewire-state="${component.id}" data-component-name="${component.name}">${JSON.stringify(component.getState())}</script>`;
                    },
                    nodewireId: (component: any) => {
                        return component.id;
                    },
                    nodewireComponent: (component: any) => {
                        return component.name;
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

