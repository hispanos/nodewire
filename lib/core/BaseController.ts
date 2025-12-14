import { Request, Response } from 'express';
import { Component } from '../nodewire/Component';

type ComponentConstructor = new (...args: any[]) => Component;

export abstract class BaseController {
    public req: Request | null = null;
    public res: Response | null = null;
    
    /**
     * Define los componentes que este controlador necesita
     * Formato: { 'NombreComponente': ComponentClass }
     * Ejemplo: { 'CounterComponent': CounterComponent }
     */
    protected static components: Record<string, ComponentConstructor> = {};
    
    /**
     * Instancia de componentes - se crea automáticamente con getters
     */
    private _componentsInstance: Record<string, (...args: any[]) => Component> | null = null;
    
    /**
     * Almacenar NodeWireManager directamente en la instancia para acceso rápido
     */
    private _nodeWireManager?: any;
    
    /**
     * Obtiene los componentes definidos en este controlador
     */
    public static getComponents(): Record<string, ComponentConstructor> {
        return this.components;
    }

    /**
     * Acceso a los componentes como this.components.ComponentName({ prop: value })
     * Los componentes se crean automáticamente cuando se acceden
     * Acepta un objeto con propiedades nombradas o argumentos posicionales
     */
    public get components(): Record<string, (options?: Record<string, any>) => Component> {
        if (!this._componentsInstance) {
            const nodeWireManager = this.getNodeWireManager();
            const staticComponents = (this.constructor as any).components || {};
            
            this._componentsInstance = {};
            
            // Crear funciones factory para cada componente
            for (const [name, ComponentClass] of Object.entries(staticComponents)) {
                this._componentsInstance[name] = (options?: Record<string, any>) => {
                    if (!nodeWireManager) {
                        throw new Error(`NodeWireManager no disponible. No se puede crear el componente ${name}`);
                    }
                    
                    // Si se pasa un objeto, usarlo directamente
                    // Si no se pasa nada, usar objeto vacío
                    if (options && typeof options === 'object' && !Array.isArray(options)) {
                        // Crear el componente pasando el objeto de opciones
                        // El NodeWireManager necesitará adaptarse para esto
                        return nodeWireManager.createComponentWithOptions(name, options);
                    } else {
                        // Fallback: usar createComponent normal
                        return nodeWireManager.createComponent(name, options);
                    }
                };
            }
        }
        
        return this._componentsInstance;
    }

    /**
     * Crea un Proxy que permite acceder a los métodos como controller.method
     * y automáticamente los bindea
     * También registra automáticamente los componentes del controlador
     */
    public static createProxy<T extends BaseController>(
        instance: T, 
        nodeWireManager?: any
    ): T {
        // Almacenar NodeWireManager en la instancia para acceso directo
        if (nodeWireManager) {
            instance.setNodeWireManager(nodeWireManager);
            
            // Registrar componentes automáticamente si hay NodeWireManager
            const components = (instance.constructor as any).getComponents();
            if (components && Object.keys(components).length > 0) {
                for (const [name, ComponentClass] of Object.entries(components)) {
                    nodeWireManager.registerComponent(name, ComponentClass as any);
                    console.log(`[BaseController] Componente ${name} registrado automáticamente desde ${instance.constructor.name}`);
                }
            }
        }

        return new Proxy(instance, {
            get(target: T, prop: string | symbol) {
                const value = (target as any)[prop];
                
                // Si es un método y no es bind, bind, req, res, etc.
                // PERO solo si se accede directamente desde el Router
                // No devolver método bindeado si se accede internamente
                if (typeof value === 'function' && 
                    prop !== 'bind' && 
                    prop !== 'constructor' &&
                    prop !== 'render' &&
                    prop !== 'json' &&
                    prop !== 'createComponent' &&
                    prop !== 'getNodeWireManager' &&
                    prop !== 'setNodeWireManager' &&
                    !prop.toString().startsWith('__') &&
                    !prop.toString().startsWith('_')) {
                    // Retornar el método bindeado solo para uso en rutas
                    // El Router debe establecer req y res antes de llamarlo
                    return instance.bind(prop as keyof T);
                }
                
                return value;
            },
            set(target: T, prop: string | symbol, value: any): boolean {
                // Permitir establecer req y res directamente
                (target as any)[prop] = value;
                return true;
            }
        });
    }

    /**
     * Renderiza una vista
     * @param view Nombre de la vista a renderizar
     * @param data Datos a pasar a la vista
     * @param options Opciones adicionales:
     *   - layout: Nombre del layout a usar (ej: 'app', 'admin')
     *   - sections: Objeto con secciones personalizadas del layout. 
     *     Cada sección puede ser un componente NodeWire o una ruta de vista.
     *     Ejemplo: { sidebar: myComponent, header: 'partials/header', footer: footerComponent }
     */
    protected render(
        view: string, 
        data: any = {}, 
        options?: { 
            layout?: string; 
            sections?: Record<string, any>;
        }
    ): void {
        if (!this.res) {
            throw new Error('Response no disponible');
        }
        
        // Si se especifica un layout, preparar los datos para el layout
        if (options?.layout) {
            // Agregar información del layout a los datos
            data._layout = {
                name: options.layout,
                view: view,
                sections: options.sections || {}
            };
            // Renderizar el layout en lugar de la vista directamente
            this.res.render(`layouts/${options.layout}`, data);
        } else {
            // Renderizar la vista normalmente
            this.res.render(view, data);
        }
    }

    /**
     * Devuelve una respuesta JSON
     */
    protected json(data: any, status: number = 200): void {
        if (!this.res) {
            throw new Error('Response no disponible');
        }
        this.res.status(status).json(data);
    }

    /**
     * Redirige a una URL
     */
    protected redirect(url: string, status: number = 302): void {
        if (!this.res) {
            throw new Error('Response no disponible');
        }
        this.res.redirect(status, url);
    }

    /**
     * Devuelve un error
     */
    protected error(message: string, status: number = 500): void {
        if (!this.res) {
            throw new Error('Response no disponible');
        }
        this.res.status(status).send(message);
    }

    /**
     * Obtiene un parámetro de la ruta
     */
    protected param(name: string): string | undefined {
        return this.req?.params[name];
    }

    /**
     * Obtiene un query parameter
     */
    protected query(name: string): string | undefined {
        return this.req?.query[name] as string | undefined;
    }

    /**
     * Obtiene el body de la petición
     */
    protected body(): any {
        return this.req?.body;
    }

    /**
     * Obtiene el NodeWireManager desde app.locals o desde la instancia
     */
    protected getNodeWireManager(): any {
        // Primero intentar desde la instancia (más confiable)
        if (this._nodeWireManager) {
            return this._nodeWireManager;
        }
        // Fallback: desde req.app.locals
        return (this.req as any)?.app?.locals?.nodeWireManager;
    }

    /**
     * Establece el NodeWireManager en la instancia
     */
    public setNodeWireManager(nodeWireManager: any): void {
        this._nodeWireManager = nodeWireManager;
    }

    /**
     * Crea un componente NodeWire de forma simple
     * La lógica de verificación está centralizada aquí
     */
    protected createComponent(componentName: string, ...args: any[]): Component {
        const nodeWireManager = this.getNodeWireManager();
        
        if (!nodeWireManager) {
            throw new Error(`NodeWireManager no disponible. Asegúrate de que la aplicación esté correctamente configurada.`);
        }

        try {
            return nodeWireManager.createComponent(componentName, ...args);
        } catch (error: any) {
            console.error(`[BaseController] Error creando componente ${componentName}:`, error);
            throw new Error(`No se pudo crear el componente ${componentName}: ${error.message}`);
        }
    }

    /**
     * Crea un método bindeado que puede ser usado en las rutas
     * Uso: router.get('/', controller.bind('index'))
     * O: router.get('/', 'index', controller)
     */
    public bind(methodName: keyof this): (req: Request, res: Response) => void | Promise<void> {
        const method = this[methodName];
        if (typeof method !== 'function') {
            throw new Error(`El método ${String(methodName)} no existe o no es una función`);
        }

        // Marcar esta función como bindeada de un controlador
        const boundMethod = async (req: Request, res: Response) => {
            this.req = req;
            this.res = res;
            try {
                await (method as any).call(this, req, res);
            } catch (error: any) {
                console.error(`Error en ${this.constructor.name}.${String(methodName)}:`, error);
                if (!res.headersSent) {
                    res.status(500).send('Error interno del servidor');
                }
            }
        };

        // Marcar la función para que el Router pueda identificarla
        (boundMethod as any).__isControllerMethod = true;
        (boundMethod as any).__controllerInstance = this;
        (boundMethod as any).__methodName = String(methodName);

        return boundMethod;
    }
}

