import { ParsedTemplate } from './BladeParser';

export class BladeCompiler {
    private viewsPath: string;

    constructor(viewsPath: string) {
        this.viewsPath = viewsPath;
    }

    /**
     * Compila un template parseado a código JavaScript ejecutable
     */
    public compile(parsed: ParsedTemplate, templateName: string, engine: any): string {
        let code = '';
        
        // Helper functions
        code += 'const escape = (str) => { if (str == null) return ""; if (typeof str !== "string") str = String(str); return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\'/g, "&#39;"); };\n';
        code += 'let output = [];\n';
        code += 'const push = (str) => { if (str != null) output.push(String(str)); };\n';
        code += 'const raw = (str) => { if (str == null) return ""; return String(str); };\n';

        // Si tiene @extends, procesar layout
        if (parsed.extends) {
            code += this.compileWithLayout(parsed, templateName, engine);
        } else {
            // Compilar contenido directo
            code += this.compileContent(parsed.content);
        }

        code += 'return output.join("");\n';
        return code;
    }

    private compileWithLayout(parsed: ParsedTemplate, templateName: string, engine: any): string {
        let code = '';
        
        // Compilar secciones primero
        const sectionsCode: string[] = [];
        for (const [sectionName, sectionContent] of parsed.sections.entries()) {
            const sectionCompiled = this.compileContent(sectionContent);
            sectionsCode.push(`'${sectionName}': (() => {
                let output = [];
                ${sectionCompiled}
                return output.join("");
            })()`);
        }

        // Compilar contenido principal
        code += 'const mainContent = (() => {\n';
        code += '  let output = [];\n';
        code += this.compileContent(parsed.content);
        code += '  return output.join("");\n';
        code += '})();\n';

        // Renderizar layout con secciones y contenido
        code += `const layoutData = { ...data, _sections: { ${sectionsCode.join(', ')} }, _content: mainContent };\n`;
        code += `const layoutContent = engine.render('${parsed.extends}', layoutData);\n`;
        code += 'output.push(layoutContent);\n';

        return code;
    }

    private compileContent(content: string): string {
        let code = '';
        
        // Dividir el contenido en partes: texto y expresiones ${...}
        const parts = this.splitContent(content);
        
        for (const part of parts) {
            if (part.type === 'expression') {
                // Es una expresión JavaScript - evaluar y agregar
                code += `push(${part.value});\n`;
            } else if (part.type === 'text') {
                // Es texto literal
                if (part.value) {
                    // Escapar caracteres especiales para template literal
                    const escaped = part.value
                        .replace(/\\/g, '\\\\')
                        .replace(/`/g, '\\`')
                        .replace(/\${/g, '\\${')
                        .replace(/\r?\n/g, '\\n')
                        .replace(/\r/g, '\\r')
                        .replace(/\t/g, '\\t');
                    code += `push(\`${escaped}\`);\n`;
                }
            }
        }

        return code;
    }

    private splitContent(content: string): Array<{ type: 'text' | 'expression', value: string }> {
        const parts: Array<{ type: 'text' | 'expression', value: string }> = [];
        let currentIndex = 0;
        
        // Buscar expresiones ${...}
        const expressionRegex = /\$\{([^}]+)\}/g;
        let match;

        while ((match = expressionRegex.exec(content)) !== null) {
            // Agregar texto antes de la expresión
            if (match.index > currentIndex) {
                const text = content.substring(currentIndex, match.index);
                if (text) {
                    parts.push({ type: 'text', value: text });
                }
            }

            // Agregar la expresión
            parts.push({ type: 'expression', value: match[1] });

            currentIndex = match.index + match[0].length;
        }

        // Agregar texto restante
        if (currentIndex < content.length) {
            const text = content.substring(currentIndex);
            if (text) {
                parts.push({ type: 'text', value: text });
            }
        }

        // Si no hay expresiones, todo es texto
        if (parts.length === 0 && content) {
            parts.push({ type: 'text', value: content });
        }

        return parts;
    }
}
