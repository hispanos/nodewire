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

export class ViewParser {
    /**
     * Parsea un template View y extrae sus componentes
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
                    let valueStr = propMatch[2].trim();
                    let value: any = valueStr;
                    // Evaluar valor (simplificado, en producción usar un parser más robusto)
                    if (valueStr.startsWith('"') || valueStr.startsWith("'")) {
                        value = valueStr.slice(1, -1);
                    } else if (valueStr === 'true') {
                        value = true;
                    } else if (valueStr === 'false') {
                        value = false;
                    } else if (!isNaN(Number(valueStr))) {
                        value = Number(valueStr);
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

        // @else
        content = content.replace(/@else/g, '` : `');

        // @endif - cerrar la expresión ternaria
        content = content.replace(/@endif/g, '` : ``}');

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
                console.warn(`[View] Include no encontrado: ${includeFullPath}`);
                processed = processed.replace(match[0], '');
            }
        }

        return processed;
    }

    private processVariables(content: string): string {
        // Variables sin escape {!! $var !!} o {!! expresión !!}
        content = content.replace(/\{!!\s*([^!]+)\s*!!\}/g, (match, expression) => {
            const jsExpr = this.convertViewExpression(expression.trim());
            return `\${${jsExpr}}`;
        });

        // Variables con escape {{ $var }} o {{ expresión }}
        content = content.replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, expression) => {
            const jsExpr = this.convertViewExpression(expression.trim());
            return `\${escape(${jsExpr})}`;
        });

        return content;
    }

    private convertViewExpression(expression: string): string {
        // Convertir expresiones de View a JavaScript
        
        // Variables simples $var
        expression = expression.replace(/\$(\w+)/g, 'data.$1');
        
        // Acceso a propiedades $var->prop o $var['key']
        expression = expression.replace(/\$(\w+)->(\w+)/g, 'data.$1.$2');
        expression = expression.replace(/\$(\w+)\[['"](\w+)['"]\]/g, 'data.$1.$2');
        
        // Métodos comunes de View
        expression = expression.replace(/\$(\w+)->(\w+)\(\)/g, 'data.$1.$2()');
        
        // Operadores
        expression = expression.replace(/===/g, '===');
        expression = expression.replace(/!==/g, '!==');
        expression = expression.replace(/==/g, '==');
        expression = expression.replace(/!=/g, '!=');
        
        return expression;
    }

    private convertCondition(condition: string): string {
        // Convertir condiciones de View a JavaScript
        let jsCondition = condition.trim();
        
        // Reemplazar $variable con data.variable
        jsCondition = jsCondition.replace(/\$(\w+)/g, 'data.$1');
        
        // Reemplazar operadores comunes
        jsCondition = jsCondition.replace(/===/g, '===');
        jsCondition = jsCondition.replace(/!==/g, '!==');
        jsCondition = jsCondition.replace(/==/g, '==');
        jsCondition = jsCondition.replace(/!=/g, '!=');
        
        return jsCondition;
    }
}
