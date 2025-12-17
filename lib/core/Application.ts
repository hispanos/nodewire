import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'node:path';
import { createServer, Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { NodeWireManager } from '../nodewire/NodeWireManager';
import { Router } from './Router';
import { BladeEngine } from '../blade/BladeEngine';

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
    private bladeEngine: BladeEngine | null = null;
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
        
        // Inicializar BladeEngine con el viewsPath (ya sea explícito o por defecto)
        // this.config.viewsPath siempre será un string debido al valor por defecto
        this.bladeEngine = new BladeEngine({
            viewsPath: this.config.viewsPath!,
            cacheEnabled: false // Deshabilitar cache en desarrollo
        });
        
        // Configurar NodeWireManager con BladeEngine
        this.nodeWireManager.setBladeEngine(this.bladeEngine);
        
        this.setupMiddleware();
        this.setupNodeWire();
    }

    private setupMiddleware(): void {
        // Parsear JSON
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Servir archivos estáticos
        this.app.use(express.static(this.config.staticPath!));

        // Exponer NodeWireManager y BladeEngine en app.locals para que los controladores puedan acceder
        this.app.locals.nodeWireManager = this.nodeWireManager;
        this.app.locals.bladeEngine = this.bladeEngine;

        // Configurar NodeWireManager con BladeEngine si aún no está configurado
        if (!(this.nodeWireManager as any).bladeEngine && this.bladeEngine) {
            this.nodeWireManager.setBladeEngine(this.bladeEngine);
        }

        // Interceptar res.render para usar BladeEngine y aplicar auto-marcado de NodeWire
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            (res as any).render = (view: string, data: any = {}, callback?: (err: Error, html: string) => void) => {
                // Verificar si hay un layout especificado
                const layout = data?._layout;
                
                if (layout && layout.name) {
                    // Si hay un layout, primero renderizar la vista y luego el layout
                    const viewToRender = layout.view || view;
                    
                    // Agregar referencias necesarias para helpers en los datos de la vista
                    const viewData = {
                        ...data,
                        _nodeWireManager: this.nodeWireManager,
                        _viewsPath: this.config.viewsPath,
                        _sectionBlocks: {} // Inicializar objeto para almacenar contenido de bloques
                    };
                    
                    // Renderizar la vista primero con BladeEngine
                    if (!this.bladeEngine) {
                        const err = new Error('BladeEngine no está disponible');
                            if (callback) callback(err, '');
                            return;
                        }
                    
                    try {
                        const viewHtml = this.bladeEngine.render(viewToRender, viewData);
                        
                        // Debug: verificar que la vista se haya renderizado
                        console.log(`[Layout] Vista ${viewToRender} renderizada:`, {
                            hasContent: !!viewHtml,
                            type: typeof viewHtml,
                            length: typeof viewHtml === 'string' ? viewHtml.length : 'N/A',
                            preview: typeof viewHtml === 'string' ? viewHtml.substring(0, 150) : String(viewHtml)
                        });
                        
                        // Inicializar objeto para almacenar contenido de bloques si no existe
                        if (!viewData._sectionBlocks) {
                            viewData._sectionBlocks = {};
                        }
                        
                        // Renderizar todas las secciones del layout
                        const sections = layout.sections || {};
                        const renderedSections: Record<string, string> = {};
                        
                        // Función helper para renderizar una sección
                        // IMPORTANTE: Usar viewData._sectionBlocks que tiene los bloques capturados
                        const renderSection = (sectionName: string, sectionContent: any): string => {
                            if (!sectionContent) {
                                return '';
                            }
                            
                            // Si es un componente NodeWire
                            if (typeof sectionContent === 'object' && 'render' in sectionContent) {
                                try {
                                    const templateEngine = this.nodeWireManager.getTemplateEngine(this.config.viewsPath);
                                    const html = sectionContent.render(templateEngine);
                                    // Asegurar que sea un string
                                    return typeof html === 'string' ? html : String(html || '');
                                } catch (e) {
                                    console.warn(`[Layout] No se pudo renderizar sección ${sectionName} (componente):`, e);
                                    return '';
                                }
                            }
                            
                            // Si es una ruta de vista
                            if (typeof sectionContent === 'string') {
                                try {
                                    const templateEngine = this.nodeWireManager.getTemplateEngine(this.config.viewsPath);
                                    // Preparar datos para la vista de la sección, incluyendo _content del bloque si existe
                                    // Usar viewData._sectionBlocks que tiene los bloques capturados del pre-renderizado
                                    const blockContent = (viewData._sectionBlocks && viewData._sectionBlocks[sectionName]) || '';
                                    const sectionData = {
                                        ...data,
                                        _content: blockContent
                                    };
                                    
                                    // Debug: verificar qué se está pasando
                                    console.log(`[Layout] Renderizando sección ${sectionName} con _content:`, {
                                        hasBlockContent: !!blockContent,
                                        blockContentLength: typeof blockContent === 'string' ? blockContent.length : 'N/A',
                                        blockContentPreview: typeof blockContent === 'string' ? blockContent.substring(0, 100) : String(blockContent),
                                        availableBlocks: Object.keys(viewData._sectionBlocks || {})
                                    });
                                    
                                    // Pasar todos los datos para que las partials tengan acceso al contexto completo
                                    const html = templateEngine.render(sectionContent, sectionData);
                                    
                                    // Debug: verificar qué devuelve
                                    console.log(`[Layout] Renderizando sección ${sectionName} (${sectionContent}):`, {
                                        type: typeof html,
                                        isString: typeof html === 'string',
                                        value: typeof html === 'string' ? html.substring(0, 100) : html
                                    });
                                    
                                    // Asegurar que sea un string válido
                                    if (html === null || html === undefined) {
                                        console.warn(`[Layout] Sección ${sectionName} devolvió null/undefined`);
                                        return '';
                                    }
                                    
                                    // Si no es un string, intentar convertirlo
                                    if (typeof html !== 'string') {
                                        console.error(`[Layout] Sección ${sectionName} devolvió ${typeof html} en lugar de string:`, html);
                                        return '';
                                    }
                                    
                                    // Verificar que no sea "[object Object]"
                                    if (html === '[object Object]' || html.startsWith('[object ')) {
                                        console.error(`[Layout] Sección ${sectionName} devolvió objeto en lugar de HTML. Vista: ${sectionContent}`);
                                        return '';
                                    }
                                    
                                    return html;
                                } catch (e) {
                                    console.warn(`[Layout] No se pudo renderizar sección ${sectionName} (vista: ${sectionContent}):`, e);
                                    if ((e as any).stack) {
                                        console.error((e as any).stack);
                                    }
                                    return '';
                                }
                            }
                            
                            // Si es un objeto pero no tiene render, convertir a string vacío
                            if (typeof sectionContent === 'object') {
                                console.warn(`[Layout] Sección ${sectionName} es un objeto sin método render, ignorando`);
                                return '';
                            }
                            
                            return '';
                        };
                        
                        // Renderizar todas las secciones
                        for (const [sectionName, sectionContent] of Object.entries(sections)) {
                            const rendered = renderSection(sectionName, sectionContent);
                            // Verificar que sea un string válido
                            if (typeof rendered !== 'string') {
                                console.error(`[Layout] Sección ${sectionName} no es un string, es: ${typeof rendered}`, rendered);
                                renderedSections[sectionName] = '';
                            } else if (rendered === '[object Object]' || rendered.startsWith('[object ')) {
                                console.error(`[Layout] Sección ${sectionName} devolvió objeto convertido a string:`, rendered);
                                renderedSections[sectionName] = '';
                            } else {
                                renderedSections[sectionName] = rendered;
                            }
                        }
                        
                        // Debug: verificar las secciones renderizadas
                        console.log('[Layout] Secciones renderizadas:', Object.keys(renderedSections).map(k => ({
                            name: k,
                            type: typeof renderedSections[k],
                            length: typeof renderedSections[k] === 'string' ? renderedSections[k].length : 'N/A',
                            preview: typeof renderedSections[k] === 'string' ? renderedSections[k].substring(0, 50) : String(renderedSections[k])
                        })));
                        
                        // Preparar datos para el layout
                        // IMPORTANTE: Mantener todos los datos originales (incluyendo componentes) para que estén disponibles en el layout
                        // Asegurar que viewHtml sea un string válido
                        const contentHtml = typeof viewHtml === 'string' ? viewHtml : String(viewHtml || '');
                        
                        const layoutData = {
                            ...data,
                            _content: contentHtml,
                            _sections: renderedSections,
                            _nodeWireManager: this.nodeWireManager,
                            _viewsPath: this.config.viewsPath,
                            _sectionBlocks: viewData._sectionBlocks || {}
                        };
                        
                        // Debug: verificar que _content esté en layoutData
                        console.log(`[Layout] Preparando layoutData:`, {
                            hasContent: !!layoutData._content,
                            type: typeof layoutData._content,
                            length: typeof layoutData._content === 'string' ? layoutData._content.length : 'N/A',
                            preview: typeof layoutData._content === 'string' ? layoutData._content.substring(0, 150) : String(layoutData._content),
                            hasSections: !!layoutData._sections,
                            sectionsKeys: Object.keys(layoutData._sections || {})
                        });
                        
                        // Renderizar el layout con BladeEngine
                        if (!this.bladeEngine) {
                            const err = new Error('BladeEngine no está disponible');
                                if (callback) callback(err, '');
                                return;
                            }
                        
                        try {
                            let layoutHtml = this.bladeEngine.render(`layouts/${layout.name}`, layoutData);
                            
                            // Reemplazar los marcadores de secciones con el contenido renderizado
                            let processedLayoutHtml = layoutHtml;
                            for (const [sectionName, renderedContent] of Object.entries(renderedSections)) {
                                const marker = `<!--@SECTION:${sectionName}@-->`;
                                processedLayoutHtml = processedLayoutHtml.replace(marker, renderedContent);
                            }
                            
                            if (processedLayoutHtml) {
                                // Post-procesar el HTML para aplicar auto-marcado de NodeWire
                                let processedHtml = processedLayoutHtml;
                                
                                // Buscar TODOS los componentes en los datos (no solo el primero)
                                const components: any[] = [];
                                if (data) {
                                    for (const key in data) {
                                        const value = (data as any)[key];
                                        if (value && typeof value === 'object' && 'id' in value && 'name' in value && 'getState' in value) {
                                            components.push(value);
                                        }
                                    }
                                }
                                
                                // También buscar componentes en las secciones renderizadas
                                if (renderedSections) {
                                    // Las secciones ya están renderizadas como HTML, pero podríamos tener componentes
                                    // que se renderizaron dentro de las secciones
                                }
                                
                                // Procesar cada componente encontrado
                                for (const component of components) {
                                    processedHtml = this.nodeWireManager.autoMarkComponentProperties(processedHtml, component);
                                }
                                
                                if (callback) {
                                callback(null as any, processedHtml);
                                } else {
                                    res.send(processedHtml);
                                }
                            } else {
                            if (callback) callback(null as any, '');
                        }
                    } catch (layoutErr: any) {
                        console.error(`[Layout] Error renderizando layout ${layout.name}:`, layoutErr);
                        if (callback) callback(layoutErr, '');
                            }
                } catch (viewErr: any) {
                    console.error(`[Layout] Error renderizando vista ${viewToRender}:`, viewErr);
                    if (callback) callback(viewErr, '');
                }
                } else {
                    // Renderizar normalmente sin layout usando BladeEngine
                    if (!this.bladeEngine) {
                        const err = new Error('BladeEngine no está disponible');
                        if (callback) callback(err, '');
                        return;
                    }
                    
                    try {
                    const viewData = {
                        ...data,
                        _nodeWireManager: this.nodeWireManager,
                        _viewsPath: this.config.viewsPath
                    };
                        
                        let html = this.bladeEngine.render(view, viewData);
                        
                        if (html) {
                            // Post-procesar el HTML para aplicar auto-marcado de NodeWire
                            let processedHtml = html;
                            
                            // Buscar TODOS los componentes en los datos (no solo el primero)
                            const components: any[] = [];
                            if (data) {
                                for (const key in data) {
                                    const value = (data as any)[key];
                                    if (value && typeof value === 'object' && 'id' in value && 'name' in value && 'getState' in value) {
                                        components.push(value);
                                    }
                                }
                            }
                            
                            // Procesar cada componente encontrado
                            for (const component of components) {
                                processedHtml = this.nodeWireManager.autoMarkComponentProperties(processedHtml, component);
                            }
                            
                            if (callback) {
                                callback(null as any, processedHtml);
                            } else {
                                res.send(processedHtml);
                            }
                        } else {
                            if (callback) callback(null as any, '');
                        }
                    } catch (viewErr: any) {
                        console.error(`[Blade] Error renderizando vista ${view}:`, viewErr);
                        if (callback) callback(viewErr, '');
                    }
                }
            };
            
            next();
        });
    }


    private setupNodeWire(): void {
        // Endpoint HTTP para compatibilidad (fallback)
        this.app.post('/nodewire/call', async (req: Request, res: Response) => {
            try {
                const { id, component, method, args = [], state } = req.body;
                
                const result = await this.nodeWireManager.handleComponentCall(
                    id,
                    component,
                    method,
                    args,
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
                    const { id, component, method, args = [], state, requestId } = data;

                    const result = await this.nodeWireManager.handleComponentCall(
                        id,
                        component,
                        method,
                        args,
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

