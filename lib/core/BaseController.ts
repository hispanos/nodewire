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
        // Registrar componentes automáticamente si hay NodeWireManager
        if (nodeWireManager) {
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
                if (typeof value === 'function' && 
                    prop !== 'bind' && 
                    prop !== 'constructor' &&
                    !prop.toString().startsWith('__')) {
                    // Retornar el método bindeado
                    return instance.bind(prop as keyof T);
                }
                
                return value;
            }
        });
    }

    /**
     * Renderiza una vista
     */
    protected render(view: string, data: any = {}): void {
        if (!this.res) {
            throw new Error('Response no disponible');
        }
        this.res.render(view, data);
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
     * Obtiene el NodeWireManager desde app.locals
     */
    protected getNodeWireManager(): any {
        return (this.req as any)?.app?.locals?.nodeWireManager;
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

