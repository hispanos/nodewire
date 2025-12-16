import fs from 'fs';
import path from 'path';

export interface ParsedTemplate {
    content: string;
    extends?: string;
    sections: Map<string, string>;
    components: Map<string, ComponentInfo>;
    slots: Map<string, string>;
}

export interface ComponentInfo {
    name: string;
    props: Record<string, any>;
    slot: string;
}

export class BladeParser {
    /**
     * Parsea un template Blade y extrae sus componentes
     */
    public parse(templateContent: string, viewsPath: string): ParsedTemplate {
        const result: ParsedTemplate = {
            content: '',
            sections: new Map(),
            components: new Map(),
            slots: new Map()
        };

        let currentContent = templateContent;
        let processedContent = '';

        // Procesar @extends
        const extendsMatch = currentContent.match(/@extends\s*\(\s*['"]([^'"]+)['"]\s*\)/);
        if (extendsMatch) {
            result.extends = extendsMatch[1];
            currentContent = currentContent.replace(extendsMatch[0], '');
        }

        // Procesar @yield primero (en layouts)
        currentContent = this.processYields(currentContent);

        // Procesar @section/@endsection
        currentContent = this.processSections(currentContent, result);

        // Procesar @component/@endcomponent
        currentContent = this.processComponents(currentContent, result, viewsPath);

        // Procesar @slot/@endslot
        currentContent = this.processSlots(currentContent, result);

        // Procesar @if/@elseif/@else/@endif
        currentContent = this.processConditionals(currentContent);

        // Procesar @foreach/@endforeach
        currentContent = this.processLoops(currentContent);

        // Procesar @include
        currentContent = this.processIncludes(currentContent, viewsPath);

        // Procesar variables {{ $var }} y {!! $var !!}
        currentContent = this.processVariables(currentContent);

        // El contenido restante es el contenido principal
        result.content = currentContent.trim();

        return result;
    }

    private processYields(content: string): string {
        // @yield('sectionName') o @yield('sectionName', 'default')
        const yieldRegex = /@yield\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?\s*\)/g;
        return content.replace(yieldRegex, (match, sectionName, defaultValue) => {
            return `\${(data._sections && data._sections['${sectionName}']) || '${defaultValue || ''}'}`;
        });
    }

    private processSections(content: string, result: ParsedTemplate): string {
        const sectionRegex = /@section\s*\(\s*['"]([^'"]+)['"]\s*\)\s*([\s\S]*?)@endsection/g;
        let match;
        let processed = content;

        while ((match = sectionRegex.exec(content)) !== null) {
            const sectionName = match[1];
            const sectionContent = match[2].trim();
            result.sections.set(sectionName, sectionContent);
            // Reemplazar con marcador que será procesado después
            processed = processed.replace(match[0], `<!--SECTION:${sectionName}-->`);
        }

        return processed;
    }

    private processComponents(content: string, result: ParsedTemplate, viewsPath: string): string {
        const componentRegex = /@component\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*\[([^\]]+)\])?\s*\)\s*([\s\S]*?)@endcomponent/g;
        let match;
        let processed = content;

        while ((match = componentRegex.exec(content)) !== null) {
            const componentName = match[1];
            const propsString = match[2] || '';
            const slotContent = match[3].trim();

            // Parsear props
            const props: Record<string, any> = {};
            if (propsString) {
                const propMatches = propsString.matchAll(/(\w+)\s*=>\s*([^,]+)/g);
                for (const propMatch of propMatches) {
                    const key = propMatch[1].trim();
                    let value: any = propMatch[2].trim();
                    // Evaluar valor (simplificado, en producción usar un parser más robusto)
                    if (value.startsWith('"') || value.startsWith("'")) {
                        value = value.slice(1, -1);
                    } else if (value === 'true') {
                        value = true;
                    } else if (value === 'false') {
                        value = false;
                    } else if (!isNaN(Number(value))) {
                        value = Number(value);
                    }
                    props[key] = value;
                }
            }

            result.components.set(componentName, {
                name: componentName,
                props,
                slot: slotContent
            });

            processed = processed.replace(match[0], `<!--COMPONENT:${componentName}-->`);
        }

        return processed;
    }

    private processSlots(content: string, result: ParsedTemplate): string {
        const slotRegex = /@slot\s*\(\s*['"]([^'"]+)['"]\s*\)\s*([\s\S]*?)@endslot/g;
        let match;
        let processed = content;

        while ((match = slotRegex.exec(content)) !== null) {
            const slotName = match[1];
            const slotContent = match[2].trim();
            result.slots.set(slotName, slotContent);
            processed = processed.replace(match[0], `<!--SLOT:${slotName}-->`);
        }

        return processed;
    }

    private processConditionals(content: string): string {
        // @if - convertir a expresión JavaScript embebida
        content = content.replace(/@if\s*\(\s*([^)]+)\s*\)/g, (match, condition) => {
            const jsCondition = this.convertCondition(condition);
            return `\${${jsCondition} ? \``;
        });

        // @elseif - cerrar el if anterior y abrir nuevo
        content = content.replace(/@elseif\s*\(\s*([^)]+)\s*\)/g, (match, condition) => {
            const jsCondition = this.convertCondition(condition);
            return `\` : ${jsCondition} ? \``;
        });

        // @else - cerrar el if anterior y abrir else
        content = content.replace(/@else/g, '` : `');

        // @endif - cerrar el template literal y la expresión ternaria
        // Buscar hacia atrás desde cada @endif para ver si hay un `: ` (de @else)
        // dentro de los últimos 200 caracteres (suficiente para la mayoría de casos)
        content = content.replace(/@endif/g, (match, offset, string) => {
            // Buscar hacia atrás hasta encontrar el @if correspondiente o un `: `
            const lookback = Math.min(200, offset);
            const before = string.substring(offset - lookback, offset);
            
            // Si encontramos `: ` (de @else) y no es parte de un @elseif, hay @else
            // Buscar el patrón `: ` que no esté precedido por @elseif
            const hasElse = /` : `/.test(before) && !/@elseif/.test(before.substring(Math.max(0, before.lastIndexOf('` : `') - 20)));
            
            return hasElse ? '`}' : `\` : ''}`;
        });

        return content;
    }

    private processLoops(content: string): string {
        // @foreach - convertir a expresión JavaScript
        // Necesitamos un enfoque más complejo para manejar loops dentro de template literals
        // Por ahora, usaremos marcadores que el compilador procesará
        content = content.replace(/@foreach\s*\(\s*([^)]+)\s*\)/g, (match, loopExpr) => {
            // Parsear $items as $item o $items as $key => $value
            const loopMatch = loopExpr.match(/\$(\w+)\s+as\s+\$(\w+)(?:\s*=>\s*\$(\w+))?/);
            if (loopMatch) {
                const itemsVar = loopMatch[1];
                const valueVar = loopMatch[2];
                const keyVar = loopMatch[3];
                if (keyVar) {
                    return `<!--LOOP:${itemsVar}:${keyVar}:${valueVar}-->`;
                } else {
                    return `<!--LOOP:${itemsVar}::${valueVar}-->`;
                }
            }
            return match;
        });

        // @endforeach
        content = content.replace(/@endforeach/g, '<!--ENDLOOP-->');

        return content;
    }

    private processIncludes(content: string, viewsPath: string): string {
        const includeRegex = /@include\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*\[([^\]]+)\])?\s*\)/g;
        let match;
        let processed = content;

        while ((match = includeRegex.exec(content)) !== null) {
            const includePath = match[1];
            const propsString = match[2] || '';
            
            // Leer el archivo incluido
            const includeFullPath = path.join(viewsPath, `${includePath}.view`);
            if (fs.existsSync(includeFullPath)) {
                let includeContent = fs.readFileSync(includeFullPath, 'utf-8');
                
                // Procesar props si existen
                if (propsString) {
                    const propMatches = propsString.matchAll(/(\w+)\s*=>\s*([^,]+)/g);
                    for (const propMatch of propMatches) {
                        const key = propMatch[1].trim();
                        let value = propMatch[2].trim();
                        if (value.startsWith('"') || value.startsWith("'")) {
                            value = value.slice(1, -1);
                        }
                        includeContent = includeContent.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
                    }
                }
                
                processed = processed.replace(match[0], includeContent);
            } else {
                console.warn(`[Blade] Include no encontrado: ${includeFullPath}`);
                processed = processed.replace(match[0], '');
            }
        }

        return processed;
    }

    private processVariables(content: string): string {
        // Variables sin escape {!! $var !!} o {!! expresión !!}
        content = content.replace(/\{!!\s*([^!]+)\s*!!\}/g, (match, expression) => {
            const jsExpr = this.convertBladeExpression(expression.trim());
            return `\${${jsExpr}}`;
        });

        // Variables con escape {{ $var }} o {{ expresión }}
        content = content.replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, expression) => {
            const jsExpr = this.convertBladeExpression(expression.trim());
            return `\${escape(${jsExpr})}`;
        });

        return content;
    }

    private convertBladeExpression(expression: string): string {
        // Convertir expresiones de Blade a JavaScript
        
        // Palabras clave de JavaScript que no deben convertirse
        const jsKeywords = new Set(['true', 'false', 'null', 'undefined', 'this', 'new', 'typeof', 'instanceof', 'in', 'of', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'function', 'var', 'let', 'const']);
        
        // Variables con $ (compatibilidad con formato anterior)
        expression = expression.replace(/\$(\w+)/g, 'data.$1');
        
        // Acceso a propiedades $var->prop o $var['key']
        expression = expression.replace(/\$(\w+)->(\w+)/g, 'data.$1.$2');
        expression = expression.replace(/\$(\w+)\[['"](\w+)['"]\]/g, 'data.$1.$2');
        
        // Métodos comunes de Blade
        expression = expression.replace(/\$(\w+)->(\w+)\(\)/g, 'data.$1.$2()');
        
        // Encontrar todas las variables y propiedades anidadas para procesarlas
        // Primero buscar propiedades anidadas (con puntos), luego variables simples
        const replacements: Array<{ start: number, end: number, replacement: string }> = [];
        const processedRanges: Array<{ start: number, end: number }> = [];
        
        // Función auxiliar para verificar si un rango se solapa con otros ya procesados
        const isOverlapping = (start: number, end: number): boolean => {
            return processedRanges.some(range => 
                (start >= range.start && start < range.end) ||
                (end > range.start && end <= range.end) ||
                (start <= range.start && end >= range.end)
            );
        };
        
        // Primero procesar propiedades anidadas (ej: example.test.property)
        // Buscar patrones que tengan al menos un punto
        const nestedRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\b/g;
        let nestedMatch;
        
        while ((nestedMatch = nestedRegex.exec(expression)) !== null) {
            const fullMatch = nestedMatch[0];
            const matchStart = nestedMatch.index;
            const matchEnd = matchStart + fullMatch.length;
            
            if (isOverlapping(matchStart, matchEnd)) continue;
            
            // Verificar contexto: no convertir si está precedido por . :: ( [
            const before = expression.substring(Math.max(0, matchStart - 2), matchStart);
            if (before.endsWith('.') || before.endsWith('::') || before.endsWith('(') || before.endsWith('[')) {
                continue;
            }
            
            // Verificar si está seguido por . ( [ - podría ser parte de una expresión más larga
            const after = expression.substring(matchEnd, Math.min(expression.length, matchEnd + 1));
            if (after.startsWith('.')) {
                // Es parte de una propiedad más larga, saltar
                continue;
            }
            
            // Procesar la propiedad anidada
            const parts = fullMatch.split('.');
            const firstPart = parts[0];
            
            if (jsKeywords.has(firstPart)) {
                continue;
            }
            
            const rest = parts.slice(1).join('.');
            const replacement = `data.${firstPart}.${rest}`;
            replacements.push({ start: matchStart, end: matchEnd, replacement });
            processedRanges.push({ start: matchStart, end: matchEnd });
        }
        
        // Ahora procesar variables simples (sin puntos)
        const simpleVarRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
        let simpleMatch;
        
        while ((simpleMatch = simpleVarRegex.exec(expression)) !== null) {
            const varName = simpleMatch[1];
            const matchStart = simpleMatch.index;
            const matchEnd = matchStart + varName.length;
            
            if (isOverlapping(matchStart, matchEnd)) continue;
            
            // Verificar si es una keyword
            if (jsKeywords.has(varName)) {
                continue;
            }
            
            // Verificar contexto: no convertir si está precedido por . :: ( [
            const before = expression.substring(Math.max(0, matchStart - 2), matchStart);
            if (before.endsWith('.') || before.endsWith('::') || before.endsWith('(') || before.endsWith('[')) {
                continue;
            }
            
            // Verificar si está seguido por . ( [ - es parte de una expresión más compleja
            const after = expression.substring(matchEnd, Math.min(expression.length, matchEnd + 1));
            if (after.startsWith('.') || after.startsWith('(') || after.startsWith('[')) {
                continue;
            }
            
            // Verificar que no sea "data" (ya está en contexto correcto)
            if (varName === 'data') {
                continue;
            }
            
            // Es una variable simple, convertirla
            const replacement = `data.${varName}`;
            replacements.push({ start: matchStart, end: matchEnd, replacement });
            processedRanges.push({ start: matchStart, end: matchEnd });
        }
        
        // Aplicar reemplazos de atrás hacia adelante para mantener los índices correctos
        replacements.sort((a, b) => b.start - a.start); // Ordenar por posición descendente
        for (const rep of replacements) {
            expression = expression.substring(0, rep.start) + rep.replacement + expression.substring(rep.end);
        }
        
        // Operadores
        expression = expression.replace(/===/g, '===');
        expression = expression.replace(/!==/g, '!==');
        expression = expression.replace(/==/g, '==');
        expression = expression.replace(/!=/g, '!=');
        
        return expression;
    }

    private convertCondition(condition: string): string {
        // Convertir condiciones de Blade a JavaScript
        // Usar el mismo método que convertBladeExpression
        return this.convertBladeExpression(condition);
    }
}
