import express, { Router as ExpressRouter, Request, Response, NextFunction } from 'express';
import { BaseController } from './BaseController';

type RouteHandler = (req: Request, res: Response, next?: NextFunction) => void | Promise<void>;

export class Router {
    private router: ExpressRouter;

    constructor() {
        this.router = express.Router();
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
     *   - router.get('path', controller.bind('method'))  // Recomendado
     *   - router.get('path', 'method', controller)       // Alternativa
     *   - router.get('path', (req, res) => { ... })      // Handler directo
     */
    public get(
        path: string, 
        handler: RouteHandler | ((req: Request, res: Response) => void | Promise<void>) | string,
        controllerInstance?: BaseController
    ): void {
        this.router.get(path, this.wrapHandler(handler, controllerInstance));
    }

    /**
     * Registra una ruta POST
     */
    public post(
        path: string, 
        handler: RouteHandler | ((req: Request, res: Response) => void | Promise<void>) | string,
        controllerInstance?: BaseController
    ): void {
        this.router.post(path, this.wrapHandler(handler, controllerInstance));
    }

    /**
     * Registra una ruta PUT
     */
    public put(
        path: string, 
        handler: RouteHandler | ((req: Request, res: Response) => void | Promise<void>) | string,
        controllerInstance?: BaseController
    ): void {
        this.router.put(path, this.wrapHandler(handler, controllerInstance));
    }

    /**
     * Registra una ruta DELETE
     */
    public delete(
        path: string, 
        handler: RouteHandler | ((req: Request, res: Response) => void | Promise<void>) | string,
        controllerInstance?: BaseController
    ): void {
        this.router.delete(path, this.wrapHandler(handler, controllerInstance));
    }

    /**
     * Registra una ruta PATCH
     */
    public patch(
        path: string, 
        handler: RouteHandler | ((req: Request, res: Response) => void | Promise<void>) | string,
        controllerInstance?: BaseController
    ): void {
        this.router.patch(path, this.wrapHandler(handler, controllerInstance));
    }

    public getRouter(): ExpressRouter {
        return this.router;
    }
}
