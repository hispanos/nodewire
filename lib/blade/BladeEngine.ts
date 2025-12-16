import fs from 'fs';
import path from 'path';
import { BladeParser } from './BladeParser';
import { BladeCompiler } from './BladeCompiler';

export interface BladeConfig {
    viewsPath: string;
    cachePath?: string;
    cacheEnabled?: boolean;
}

export class BladeEngine {
    private config: BladeConfig;
    private parser: BladeParser;
    private compiler: BladeCompiler;
    private cache: Map<string, Function> = new Map();

    constructor(config: BladeConfig) {
        this.config = {
            cacheEnabled: false,
            ...config
        };
        this.parser = new BladeParser();
        this.compiler = new BladeCompiler(this.config.viewsPath);
        
        // Crear directorio de cache si está habilitado
        if (this.config.cacheEnabled && this.config.cachePath) {
            if (!fs.existsSync(this.config.cachePath)) {
                fs.mkdirSync(this.config.cachePath, { recursive: true });
            }
        }
    }

    /**
     * Renderiza una plantilla Blade
     * @param templatePath Ruta relativa a viewsPath (ej: 'welcome' o 'layouts/app')
     * @param data Datos a pasar a la plantilla
     * @returns HTML renderizado
     */
    public render(templatePath: string, data: any = {}): string {
        try {
            // Normalizar la ruta del template
            const normalizedPath = templatePath.replace(/\.view$/, '');
            const fullPath = path.join(this.config.viewsPath, `${normalizedPath}.view`);
            
            // Verificar que el archivo existe
            if (!fs.existsSync(fullPath)) {
                throw new Error(`Template no encontrado: ${fullPath}`);
            }

            // Leer el contenido del template
            const templateContent = fs.readFileSync(fullPath, 'utf-8');

            // Compilar y ejecutar
            const compiled = this.compile(templateContent, normalizedPath);
            return compiled(data);
        } catch (error: any) {
            console.error(`[Blade] Error renderizando template ${templatePath}:`, error);
            throw error;
        }
    }

    /**
     * Compila una plantilla Blade a una función JavaScript
     * @param templateContent Contenido del template
     * @param templateName Nombre del template (para cache)
     * @returns Función compilada
     */
    private compile(templateContent: string, templateName: string): Function {
        // Verificar cache
        if (this.config.cacheEnabled && this.cache.has(templateName)) {
            return this.cache.get(templateName)!;
        }

        // Parsear el template
        const parsed = this.parser.parse(templateContent, this.config.viewsPath);

        // Compilar a JavaScript
        const compiledCode = this.compiler.compile(parsed, templateName, this);

        // Crear función ejecutable con acceso al engine para layouts recursivos
        const compiledFunction = (data: any) => {
            return new Function('data', 'engine', compiledCode)(data, this);
        };

        // Guardar en cache si está habilitado
        if (this.config.cacheEnabled) {
            this.cache.set(templateName, compiledFunction);
        }

        return compiledFunction;
    }

    /**
     * Limpia el cache de templates compilados
     */
    public clearCache(): void {
        this.cache.clear();
        if (this.config.cachePath && fs.existsSync(this.config.cachePath)) {
            const files = fs.readdirSync(this.config.cachePath);
            files.forEach(file => {
                fs.unlinkSync(path.join(this.config.cachePath!, file));
            });
        }
    }

    /**
     * Verifica si un template existe
     */
    public exists(templatePath: string): boolean {
        const normalizedPath = templatePath.replace(/\.view$/, '');
        const fullPath = path.join(this.config.viewsPath, `${normalizedPath}.view`);
        return fs.existsSync(fullPath);
    }
}
