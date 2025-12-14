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

        // Interceptar res.render para aplicar auto-marcado de NodeWire y soportar layouts
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            const originalRender = res.render.bind(res);
            
            (res as any).render = (view: string, data: any = {}, callback?: (err: Error, html: string) => void) => {
                // Verificar si hay un layout especificado
                const layout = data?._layout;
                
                if (layout && layout.name) {
                    // Si hay un layout, primero renderizar la vista y luego el layout
                    const viewToRender = layout.view || view;
                    
                    // Renderizar la vista primero
                    originalRender(viewToRender, data, (err: Error, viewHtml: string) => {
                        if (err) {
                            console.error(`[Layout] Error renderizando vista ${viewToRender}:`, err);
                            if (callback) callback(err, '');
                            return;
                        }
                        
                        // Debug: verificar que la vista se haya renderizado
                        console.log(`[Layout] Vista ${viewToRender} renderizada:`, {
                            hasContent: !!viewHtml,
                            type: typeof viewHtml,
                            length: typeof viewHtml === 'string' ? viewHtml.length : 'N/A',
                            preview: typeof viewHtml === 'string' ? viewHtml.substring(0, 150) : String(viewHtml)
                        });
                        
                        // Renderizar todas las secciones del layout
                        const sections = layout.sections || {};
                        const renderedSections: Record<string, string> = {};
                        
                        // Función helper para renderizar una sección
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
                                    // Pasar todos los datos para que las partials tengan acceso al contexto completo
                                    const html = templateEngine.render(sectionContent, data);
                                    
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
                            _sections: renderedSections
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
                        
                        // Renderizar el layout
                        originalRender(`layouts/${layout.name}`, layoutData, (err: Error, layoutHtml: string) => {
                            if (err) {
                                if (callback) callback(err, '');
                                return;
                            }
                            
                            if (layoutHtml) {
                                // Post-procesar el HTML para aplicar auto-marcado de NodeWire
                                let processedHtml = layoutHtml;
                                
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
                                    callback(err, processedHtml);
                                } else {
                                    res.send(processedHtml);
                                }
                            } else {
                                if (callback) callback(err, '');
                            }
                        });
                    });
                } else {
                    // Renderizar normalmente sin layout
                    originalRender(view, data, (err: Error, html: string) => {
                        if (err) {
                            if (callback) callback(err, '');
                            return;
                        }
                        
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
                                callback(err, processedHtml);
                            } else {
                                res.send(processedHtml);
                            }
                        } else {
                            if (callback) callback(err, '');
                        }
                    });
                }
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
                },
                // Helper para renderizar cualquier sección del layout
                // Uso simple: {{@section 'nombreSeccion'}} - devuelve la sección o cadena vacía
                // Uso con bloque: {{#@section "nombre"}}<div>{{{.}}}</div>{{/@section}}
                //   - El bloque solo se renderiza si la sección existe
                //   - Dentro del bloque, {{{.}}} contiene el contenido de la sección
                '@section': function(sectionName: any, options?: any) {
                    try {
                        // Manejar caso donde no hay options
                        if (!options || typeof options !== 'object') {
                            console.warn(`[Layout] @section llamado sin options válidas para "${sectionName}"`);
                            return '';
                        }
                        
                        // Obtener el contexto de datos
                        // En Handlebars, options.data.root contiene el contexto completo
                        const data = (options.data && options.data.root) ? options.data.root : {};
                        const sections = data._sections || {};
                        const sectionContent = sections[sectionName];
                        
                        // Debug: verificar qué se está recibiendo
                        console.log(`[Layout] Helper @section para "${sectionName}":`, {
                            hasSection: !!sectionContent,
                            type: typeof sectionContent,
                            isString: typeof sectionContent === 'string',
                            preview: typeof sectionContent === 'string' ? sectionContent.substring(0, 100) : String(sectionContent)
                        });
                        
                        // Si es un helper de bloque (tiene options.fn)
                        if (options && typeof options.fn === 'function') {
                            // Si la sección no existe, no renderizar nada
                            if (!sectionContent) {
                                return '';
                            }
                            
                            // Asegurar que sectionContent sea un string
                            if (typeof sectionContent !== 'string') {
                                console.error(`[Layout] Helper @section: sección "${sectionName}" no es un string, es ${typeof sectionContent}:`, sectionContent);
                                return '';
                            }
                            
                            // Verificar que no sea "[object Object]"
                            if (sectionContent === '[object Object]' || sectionContent.startsWith('[object ')) {
                                console.error(`[Layout] Helper @section: sección "${sectionName}" contiene objeto convertido a string`);
                                return '';
                            }
                            
                            // Crear un contexto donde el contenido esté disponible como "content"
                            // Mantener todas las propiedades del contexto original
                            const context = {
                                ...data,
                                content: sectionContent
                            };
                            
                            // Renderizar el bloque con el contexto
                            const result = options.fn(context);
                            
                            return new Handlebars.SafeString(result);
                        } else {
                            // Helper simple: devolver el contenido de la sección o cadena vacía
                            if (typeof sectionContent !== 'string') {
                                console.error(`[Layout] Helper @section (simple): sección "${sectionName}" no es un string`);
                                return '';
                            }
                            return new Handlebars.SafeString(sectionContent);
                        }
                    } catch (error: any) {
                        console.error(`[Layout] Error en helper @section para sección "${sectionName}":`, error);
                        if (error.stack) {
                            console.error('[Layout] Stack:', error.stack);
                        }
                        return '';
                    }
                } as any,
                // Helper para verificar si una sección existe (para uso en condicionales)
                // Uso: {{#if @hasSection 'nombreSeccion'}}...{{/if}}
                '@hasSection': function(sectionName: string, options: any) {
                    try {
                        const data = (options && options.data && options.data.root) ? options.data.root : {};
                        const sections = data._sections || {};
                        return !!sections[sectionName];
                    } catch (error: any) {
                        console.error(`[Layout] Error en helper @hasSection para sección "${sectionName}":`, error);
                        return false;
                    }
                } as any,
                // Helper para renderizar el contenido principal en un layout
                // Uso: {{@content}}
                '@content': function(options: any) {
                    try {
                        const data = (options && options.data && options.data.root) ? options.data.root : (options || {});
                        const content = data._content || '';
                        
                        // Debug: verificar qué se está recibiendo
                        console.log(`[Layout] Helper @content llamado:`, {
                            hasContent: !!content,
                            type: typeof content,
                            length: typeof content === 'string' ? content.length : 'N/A',
                            preview: typeof content === 'string' ? content.substring(0, 100) : String(content),
                            dataKeys: Object.keys(data)
                        });
                        
                        // Asegurar que sea un string
                        const contentStr = typeof content === 'string' ? content : String(content || '');
                        return new Handlebars.SafeString(contentStr);
                    } catch (error: any) {
                        console.error(`[Layout] Error en helper @content:`, error);
                        return new Handlebars.SafeString('');
                    }
                } as any
            }
        });
        
        this.app.engine('.hbs', hbs.engine);
        this.app.set('view engine', '.hbs');
        this.app.set('views', this.config.viewsPath!);
        
        // Registrar helpers directamente en Handlebars para asegurar que funcionen
        // Esto es necesario porque express-handlebars puede tener problemas con algunos helpers
        const contentHelper = function(options: any) {
            try {
                const data = (options && options.data && options.data.root) ? options.data.root : (options || {});
                const content = data._content || '';
                
                // Debug: verificar qué se está recibiendo
                console.log(`[Layout] Helper @content (Handlebars directo) llamado:`, {
                    hasContent: !!content,
                    type: typeof content,
                    length: typeof content === 'string' ? content.length : 'N/A',
                    preview: typeof content === 'string' ? content.substring(0, 100) : String(content),
                    dataKeys: Object.keys(data)
                });
                
                // Asegurar que sea un string
                const contentStr = typeof content === 'string' ? content : String(content || '');
                return new Handlebars.SafeString(contentStr);
            } catch (error: any) {
                console.error(`[Layout] Error en helper @content (Handlebars directo):`, error);
                return new Handlebars.SafeString('');
            }
        };
        
        // Registrar el helper directamente en Handlebars
        Handlebars.registerHelper('@content', contentHelper as any);
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

