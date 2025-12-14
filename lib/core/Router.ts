import express, { Router as ExpressRouter, Request, Response, NextFunction } from 'express';

type RouteHandler = (req: Request, res: Response, next?: NextFunction) => void | Promise<void>;

export class Router {
    private router: ExpressRouter;

    constructor() {
        this.router = express.Router();
    }

    public get(path: string, handler: RouteHandler): void {
        this.router.get(path, handler);
    }

    public post(path: string, handler: RouteHandler): void {
        this.router.post(path, handler);
    }

    public put(path: string, handler: RouteHandler): void {
        this.router.put(path, handler);
    }

    public delete(path: string, handler: RouteHandler): void {
        this.router.delete(path, handler);
    }

    public patch(path: string, handler: RouteHandler): void {
        this.router.patch(path, handler);
    }

    public getRouter(): ExpressRouter {
        return this.router;
    }
}

