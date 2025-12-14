import express, { Router as ExpressRouter, Request, Response, NextFunction } from 'express';
import { BaseController } from './BaseController';
import { NodeWireManager } from '../nodewire/NodeWireManager';

type RouteHandler = (req: Request, res: Response, next?: NextFunction) => void | Promise<void>;
type ControllerClass = new () => BaseController;

export class Router {
    private router: ExpressRouter;
    private nodeWireManager: NodeWireManager | null = null;

    constructor(nodeWireManager?: NodeWireManager) {
        this.router = express.Router();
        this.nodeWireManager = nodeWireManager || null;
    }

    /**
     * Establece el NodeWireManager para registro automático de componentes
     */
    public setNodeWireManager(nodeWireManager: NodeWireManager): void {
        this.nodeWireManager = nodeWireManager;
    }

    /**
     * Crea un wrapper para métodos de controlador que preserva el contexto
     */
    private createControllerWrapper(controllerInstance: BaseController, methodName: string): RouteHandler {
        return async (req: Request, res: Response, next?: NextFunction) => {
            try {
                // Establecer req y res en el controlador
                controllerInstance.req = req;
                controllerInstance.res = res;
                
                // Obtener el método del controlador
                const method = (controllerInstance as any)[methodName];
                if (typeof method !== 'function') {
                    throw new Error(`El método ${methodName} no existe en ${controllerInstance.constructor.name}`);
                }
                
                // Llamar al método
                await method.call(controllerInstance);
            } catch (error) {
                if (next) {
                    next(error);
                } else {
                    console.error(`Error en ${controllerInstance.constructor.name}.${methodName}:`, error);
                    if (!res.headersSent) {
                        res.status(500).send('Error interno del servidor');
                    }
                }
            }
        };
    }

    /**
     * Helper para crear rutas con controladores de forma simple
     * Uso: router.get('path', controller.method) donde method debe estar bindeado
     * O: router.get('path', 'method', controller)
     */
    private wrapHandler(handler: any, controllerInstance?: BaseController): RouteHandler {
        // Si se proporciona una instancia de controlador explícitamente
        if (controllerInstance && controllerInstance instanceof BaseController) {
            if (typeof handler === 'string') {
                return this.createControllerWrapper(controllerInstance, handler);
            }
        }

        // Si el handler es una función bindeada de un controlador
        if (typeof handler === 'function' && (handler as any).__isControllerMethod) {
            return handler as RouteHandler;
        }

        // Handler normal
        if (typeof handler === 'function') {
            return async (req: Request, res: Response, next?: NextFunction) => {
                try {
                    await handler(req, res, next);
                } catch (error) {
                    if (next) {
                        next(error);
                    } else {
                        console.error('Error en ruta:', error);
                        if (!res.headersSent) {
                            res.status(500).send('Error interno del servidor');
                        }
                    }
                }
            };
        }

        return handler;
    }

    /**
     * Registra una ruta GET
     * Uso simplificado:
     *   - router.get('path', ControllerClass, 'method')  // Super simple!
     *   - router.get('path', controller.bind('method'))  // Con instancia ya creada
     *   - router.get('path', 'method', controller)       // Alternativa
     *   - router.get('path', (req, res) => { ... })      // Handler directo
     */
    public get(
        path: string, 
        handlerOrController: RouteHandler | ControllerClass | ((req: Request, res: Response) => void | Promise<void>) | string | BaseController,
        methodNameOrHandler?: string | BaseController | RouteHandler
    ): void {
        // Caso especial: router.get('path', ControllerClass, 'method')
        if (typeof handlerOrController === 'function' && 
            handlerOrController.prototype instanceof BaseController &&
            typeof methodNameOrHandler === 'string') {
            this.registerControllerRoute(path, 'get', handlerOrController as ControllerClass, methodNameOrHandler);
            return;
        }

        // Casos normales
        this.router.get(path, this.wrapHandler(handlerOrController as any, methodNameOrHandler as BaseController));
    }

    /**
     * Registra una ruta con un controlador de forma automática
     * Crea la instancia, registra componentes y hace el bind automáticamente
     */
    private registerControllerRoute(
        path: string,
        method: 'get' | 'post' | 'put' | 'delete' | 'patch',
        ControllerClass: ControllerClass,
        methodName: string
    ): void {
        // Crear wrapper que registra componentes de forma lazy (cuando se ejecuta la ruta)
        this.router[method](path, async (req: Request, res: Response, next?: NextFunction) => {
            try {
                // Obtener NodeWireManager desde app.locals (se establece en Application)
                const nodeWireManager = (req as any)?.app?.locals?.nodeWireManager;
                
                // Registrar componentes automáticamente si hay NodeWireManager
                if (nodeWireManager) {
                    const components = (ControllerClass as any).getComponents();
                    if (components && Object.keys(components).length > 0) {
                        for (const [name, ComponentClass] of Object.entries(components)) {
                            // Verificar si el componente ya está registrado
                            if (!nodeWireManager.isComponentRegistered(name)) {
                                nodeWireManager.registerComponent(name, ComponentClass as any);
                            }
                        }
                    }
                }
                
                // Crear instancia del controlador
                const controllerInstance = new ControllerClass();
                
                // Establecer req y res ANTES de crear el proxy
                controllerInstance.req = req;
                controllerInstance.res = res;
                
                // Crear proxy si hay NodeWireManager
                const proxiedController = nodeWireManager 
                    ? BaseController.createProxy(controllerInstance, nodeWireManager)
                    : controllerInstance;
                
                // Asegurar que req y res estén en el proxiedController también
                proxiedController.req = req;
                proxiedController.res = res;
                
                // Obtener el método directamente de la instancia original
                // para evitar que el proxy devuelva un método bindeado
                const methodFunc = (controllerInstance as any)[methodName];
                if (typeof methodFunc !== 'function') {
                    throw new Error(`El método ${methodName} no existe en ${ControllerClass.name}`);
                }
                
                // Llamar al método con el proxiedController como contexto
                // para que tenga acceso a req, res y componentes
                await methodFunc.call(proxiedController);
            } catch (error) {
                if (next) {
                    next(error);
                } else {
                    console.error(`Error en ${ControllerClass.name}.${methodName}:`, error);
                    if (!res.headersSent) {
                        res.status(500).send('Error interno del servidor');
                    }
                }
            }
        });
    }

    /**
     * Registra una ruta POST
     */
    public post(
        path: string, 
        handlerOrController: RouteHandler | ControllerClass | ((req: Request, res: Response) => void | Promise<void>) | string | BaseController,
        methodNameOrHandler?: string | BaseController | RouteHandler
    ): void {
        if (typeof handlerOrController === 'function' && 
            handlerOrController.prototype instanceof BaseController &&
            typeof methodNameOrHandler === 'string') {
            this.registerControllerRoute(path, 'post', handlerOrController as ControllerClass, methodNameOrHandler);
            return;
        }
        this.router.post(path, this.wrapHandler(handlerOrController as any, methodNameOrHandler as BaseController));
    }

    /**
     * Registra una ruta PUT
     */
    public put(
        path: string, 
        handlerOrController: RouteHandler | ControllerClass | ((req: Request, res: Response) => void | Promise<void>) | string | BaseController,
        methodNameOrHandler?: string | BaseController | RouteHandler
    ): void {
        if (typeof handlerOrController === 'function' && 
            handlerOrController.prototype instanceof BaseController &&
            typeof methodNameOrHandler === 'string') {
            this.registerControllerRoute(path, 'put', handlerOrController as ControllerClass, methodNameOrHandler);
            return;
        }
        this.router.put(path, this.wrapHandler(handlerOrController as any, methodNameOrHandler as BaseController));
    }

    /**
     * Registra una ruta DELETE
     */
    public delete(
        path: string, 
        handlerOrController: RouteHandler | ControllerClass | ((req: Request, res: Response) => void | Promise<void>) | string | BaseController,
        methodNameOrHandler?: string | BaseController | RouteHandler
    ): void {
        if (typeof handlerOrController === 'function' && 
            handlerOrController.prototype instanceof BaseController &&
            typeof methodNameOrHandler === 'string') {
            this.registerControllerRoute(path, 'delete', handlerOrController as ControllerClass, methodNameOrHandler);
            return;
        }
        this.router.delete(path, this.wrapHandler(handlerOrController as any, methodNameOrHandler as BaseController));
    }

    /**
     * Registra una ruta PATCH
     */
    public patch(
        path: string, 
        handlerOrController: RouteHandler | ControllerClass | ((req: Request, res: Response) => void | Promise<void>) | string | BaseController,
        methodNameOrHandler?: string | BaseController | RouteHandler
    ): void {
        if (typeof handlerOrController === 'function' && 
            handlerOrController.prototype instanceof BaseController &&
            typeof methodNameOrHandler === 'string') {
            this.registerControllerRoute(path, 'patch', handlerOrController as ControllerClass, methodNameOrHandler);
            return;
        }
        this.router.patch(path, this.wrapHandler(handlerOrController as any, methodNameOrHandler as BaseController));
    }

    public getRouter(): ExpressRouter {
        return this.router;
    }
}
