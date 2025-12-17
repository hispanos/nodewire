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

        // Procesar @section/@endsection
        currentContent = this.processSections(currentContent, result);

        // Procesar @component/@endcomponent
        currentContent = this.processComponents(currentContent, result, viewsPath);

        // Procesar @slot/@endslot
        currentContent = this.processSlots(currentContent, result);

        // Procesar @yield ANTES de las condicionales (en layouts)
        // Esto asegura que @yield se procese antes de que las condicionales generen template literals
        currentContent = this.processYields(currentContent);

        // Procesar @if/@elseif/@else/@endif
        currentContent = this.processConditionals(currentContent);

        // Procesar @foreach/@endforeach
        currentContent = this.processLoops(currentContent);

        // Procesar @include
        currentContent = this.processIncludes(currentContent, viewsPath);

        // Procesar atributos de eventos (click), (keyup), etc. -> data-nw-event
        currentContent = this.processEventAttributes(currentContent);

        // Procesar directivas NodeWire (@nodewireState, @wire)
        currentContent = this.processNodeWireDirectives(currentContent);

        // Procesar variables {{ $var }} y {!! $var !!}
        currentContent = this.processVariables(currentContent);

        // El contenido restante es el contenido principal
        result.content = currentContent.trim();

        return result;
    }

    private processYields(content: string): string {
        // @yield('sectionName') o @yield('sectionName', 'default')
        // Procesar con comillas simples y dobles, manejando valores vacíos
        // Usar un regex más flexible que capture espacios opcionales
        const yieldRegex = /@yield\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]*)['"])?\s*\)/g;
        let lastIndex = 0;
        let result = '';
        let match;
        
        while ((match = yieldRegex.exec(content)) !== null) {
            // Agregar texto antes del match
            result += content.substring(lastIndex, match.index);
            
            const sectionName = match[1];
            const defaultValue = match[2] !== undefined ? match[2] : '';
            
            // Generar la expresión JavaScript
            const expression = `\${(data._sections && data._sections['${sectionName}']) || '${defaultValue.replace(/'/g, "\\'")}'}`;
            result += expression;
            
            lastIndex = match.index + match[0].length;
        }
        
        // Agregar el texto restante
        result += content.substring(lastIndex);
        content = result;
        
        // @content - renderiza el contenido principal del layout o el contenido pasado a componentes
        // Usar \b para asegurar que sea una palabra completa
        content = content.replace(/@content\b/g, '${data._content || \'\'}');
        
        return content;
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
        // Buscar componentes con @endcomponent de forma más precisa
        // Solo procesar componentes que tienen @endcomponent inmediatamente después (no dentro de @if sin @endcomponent)
        let processed = content;
        let searchIndex = 0;

        while (true) {
            const componentMatch = processed.substring(searchIndex).match(/@component\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*\[([^\]]+)\])?\s*\)/);
            if (!componentMatch) break;

            const componentStart = searchIndex + componentMatch.index!;
            const componentEnd = componentStart + componentMatch[0].length;
            const afterComponent = processed.substring(componentEnd);

            // Buscar el @endcomponent más cercano, pero solo si no hay un @endif antes
            // Esto evita capturar componentes dentro de @if sin @endcomponent
            const endComponentMatch = afterComponent.match(/@endcomponent/);
            if (!endComponentMatch) {
                // No tiene @endcomponent, saltarlo (será procesado por processNodeWireDirectives)
                searchIndex = componentEnd;
                continue;
            }

            // Verificar que el @endcomponent esté cerca (dentro de 200 caracteres) y sin @if/@endif intermedios
            // Esto evita capturar @endcomponent que pertenecen a otros componentes
            const beforeEndComponent = afterComponent.substring(0, endComponentMatch.index!);
            
            // Si el @endcomponent está muy lejos (más de 200 caracteres), probablemente pertenece a otro componente
            if (endComponentMatch.index! > 200) {
                searchIndex = componentEnd;
                continue;
            }
            
            // Si hay un @if o @endif antes del @endcomponent, probablemente el @endcomponent pertenece a otro componente
            // que está dentro de un @if
            if (beforeEndComponent.match(/@if\s*\(/) || beforeEndComponent.match(/@endif/)) {
                searchIndex = componentEnd;
                continue;
            }

            const slotContentStart = componentEnd;
            const slotContentEnd = componentEnd + endComponentMatch.index!;
            const slotContent = processed.substring(slotContentStart, slotContentEnd).trim();

            const componentName = componentMatch[1];
            const propsString = componentMatch[2] || '';

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

            // Si hay contenido (slotContent), generar código que renderice el componente con el contenido
            if (slotContent.trim()) {
                // Escapar el contenido para JavaScript usando JSON.stringify
                const escapedContent = JSON.stringify(slotContent);
                // Generar código simple y directo
                const replacement = `\${(function(){const c=data.${componentName};if(!c){return'';}const be=data._bladeEngine;if(!be){return'';}const nwm=data._nodeWireManager;if(!nwm){return'';}try{const slotText=${escapedContent};const renderedContent=be.renderString(slotText,data);const te=nwm.getTemplateEngine(data._viewsPath);const compName=c.name.toLowerCase().replace(/component$/,'');const html=te.render('components/'+compName,{component:c,_content:renderedContent});return html||'';}catch(e){console.error('[Blade] Error renderizando componente ${componentName}:',e);return'';}})()}`;
                const endPos = slotContentEnd + '@endcomponent'.length;
                processed = processed.substring(0, componentStart) + replacement + processed.substring(endPos);
                searchIndex = componentStart + replacement.length;
            } else {
                // Sin contenido, usar el marcador normal que será procesado por processNodeWireDirectives
                const endPos = slotContentEnd + '@endcomponent'.length;
                processed = processed.substring(0, componentStart) + `<!--COMPONENT:${componentName}-->` + processed.substring(endPos);
                searchIndex = componentStart + `<!--COMPONENT:${componentName}-->`.length;
            }
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
        // Soporta: @foreach(items as item) y @foreach(items as key => value)
        const foreachRegex = /@foreach\s*\(\s*([^)]+)\s*\)/g;
        let lastIndex = 0;
        let result = '';
        let match;
        const loopVariables = new Set<string>(); // Rastrear variables de loop para no convertirlas
        
        // Primero, encontrar todas las variables de loop
        const tempContent = content;
        const tempMatches = [...tempContent.matchAll(/@foreach\s*\(\s*([^)]+)\s*\)/g)];
        for (const tempMatch of tempMatches) {
            const loopExpr = tempMatch[1].trim();
            // Soporta propiedades anidadas: component.users, items, etc.
            const loopMatch = loopExpr.match(/([\w\.\$]+)\s+as\s+(\w+)(?:\s*=>\s*(\w+))?/);
            if (loopMatch) {
                loopVariables.add(loopMatch[2]); // valueVar (user)
                if (loopMatch[3]) {
                    loopVariables.add(loopMatch[3]); // keyVar (si existe)
                }
            }
        }
        
        // Ahora procesar los loops
        while ((match = foreachRegex.exec(content)) !== null) {
            // Agregar texto antes del match
            result += content.substring(lastIndex, match.index);
            
            const loopExpr = match[1].trim();
            
            // Parsear: items as item, component.users as user, o items as key => value
            // Soporta propiedades anidadas con puntos
            const loopMatch = loopExpr.match(/([\w\.\$]+)\s+as\s+(\w+)(?:\s*=>\s*(\w+))?/);
            
            if (loopMatch) {
                const itemsVar = loopMatch[1]; // Puede ser "component.users" o "items"
                const valueVar = loopMatch[2];
                const keyVar = loopMatch[3] || null;
                
                // Convertir la variable de items a JavaScript
                // Si tiene puntos, ya está en formato correcto (component.users -> data.component.users)
                // Si no tiene puntos, necesita convertirse (items -> data.items)
                let jsItemsVar: string;
                if (itemsVar.includes('.')) {
                    // Ya es una propiedad anidada, convertir usando convertBladeExpression
                    jsItemsVar = this.convertBladeExpression(itemsVar);
                } else {
                    // Variable simple, agregar data.
                    jsItemsVar = `data.${itemsVar}`;
                }
                
                // Convertir a JavaScript: for (const [key, value] of Object.entries(data.items)) { ... }
                if (keyVar) {
                    // Con clave y valor: @foreach(items as key => value)
                    result += `\${(function(){let html='';const items=${jsItemsVar};if(items&&Array.isArray(items)){items.forEach((${valueVar},${keyVar})=>{html+=\``;
                } else {
                    // Solo valor: @foreach(items as item) o @foreach(component.users as user)
                    result += `\${(function(){let html='';const items=${jsItemsVar};if(items&&Array.isArray(items)){items.forEach((${valueVar})=>{html+=\``;
                }
            } else {
                // Si no coincide el patrón, dejar como está
                result += match[0];
            }
            
            lastIndex = match.index + match[0].length;
        }
        
        // Agregar el texto restante
        result += content.substring(lastIndex);
        
        // Eliminar cualquier @endcomponent que quede sin procesar (deberían haberse eliminado en processComponents)
        result = result.replace(/@endcomponent/g, '');
        
        // Procesar @endforeach - cerrar el loop
        result = result.replace(/@endforeach/g, `\`;});}return html;})()}`);
        
        // Guardar las variables de loop para que convertBladeExpression las respete
        (this as any)._loopVariables = loopVariables;
        
        return result;
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

    /**
     * Procesa atributos de eventos con sintaxis (evento)="metodo"
     * Los convierte a data-nw-event-{evento}="metodo" para soportar múltiples eventos
     * Soporta todos los eventos HTML estándar
     */
    private processEventAttributes(content: string): string {
        // Buscar atributos con formato (evento)="metodo" o (evento)='metodo'
        // El patrón busca: (evento) seguido de = y luego comillas con el método
        // Soporta espacios opcionales alrededor del =
        // Captura nombres de eventos que pueden tener guiones (ej: touch-start)
        const eventAttributeRegex = /\(([a-zA-Z][a-zA-Z0-9-]*)\)\s*=\s*["']([^"']+)["']/g;
        
        return content.replace(eventAttributeRegex, (match, eventName, method) => {
            // Convertir a data-nw-event-{eventName} para permitir múltiples eventos en el mismo elemento
            return `data-nw-event-${eventName}="${method}"`;
        });
    }

    private processNodeWireDirectives(content: string): string {
        // @nodewireState(component) - genera el script de estado del componente
        content = content.replace(/@nodewireState\s*\(\s*([^)]+)\s*\)/g, (match, componentExpr) => {
            const jsExpr = this.convertBladeExpression(componentExpr.trim());
            // Generar código en una sola línea para evitar problemas con múltiples líneas
            return `\${(function(){const c=${jsExpr};if(!c||typeof c!=='object'||!c.getState||typeof c.getState!=='function'){return'';}const s=JSON.stringify(c.getState());return'<script type="application/json" data-nodewire-state="'+c.id+'" data-component-name="'+c.name+'">'+s+'</script>';})()}`;
        });

        // @component(componentName) o @component(variable) o @component(variable, { args })
        // Soporta tanto nombres de string como variables directas, con o sin argumentos
        // Procesar @component con argumentos usando un enfoque más robusto que cuenta llaves
        const componentWithArgsPattern = /@component\s*\(\s*([^,)]+)\s*,\s*(\{)/g;
        let match;
        let lastIndex = 0;
        let result = '';
        
        while ((match = componentWithArgsPattern.exec(content)) !== null) {
            result += content.substring(lastIndex, match.index);
            
            const componentExpr = match[1].trim();
            const braceStart = match.index + match[0].length - 1; // Posición de la primera {
            
            // Contar llaves balanceadas para capturar el objeto completo
            let braceCount = 0;
            let objEnd = braceStart;
            let inString = false;
            let stringChar = '';
            
            for (let i = braceStart; i < content.length; i++) {
                const char = content[i];
                
                // Manejar strings para no contar llaves dentro de strings
                if (!inString && (char === '"' || char === "'")) {
                    inString = true;
                    stringChar = char;
                } else if (inString && char === stringChar && content[i - 1] !== '\\') {
                    inString = false;
                } else if (!inString) {
                    if (char === '{') braceCount++;
                    if (char === '}') {
                        braceCount--;
                        if (braceCount === 0) {
                            objEnd = i + 1;
                            break;
                        }
                    }
                }
            }
            
            const argsObj = content.substring(braceStart, objEnd);
            
            // Buscar el paréntesis de cierre después del objeto
            let parenEnd = objEnd;
            while (parenEnd < content.length && content[parenEnd] !== ')') {
                parenEnd++;
            }
            parenEnd++; // Incluir el paréntesis
            
            // Determinar si es un nombre de string o una variable
            const isStringName = (componentExpr.startsWith("'") && componentExpr.endsWith("'")) ||
                                (componentExpr.startsWith('"') && componentExpr.endsWith('"'));
            
            if (isStringName) {
                // @component('name', { args })
                const componentName = componentExpr.slice(1, -1);
                const jsArgs = this.convertObjectLiteral(argsObj.trim());
                result += `\${(function(){const nwm=data._nodeWireManager;if(!nwm){return'';}const baseComp=data.${componentName};if(!baseComp||typeof baseComp!=='object'){return'';}const args=${jsArgs};const newComp=nwm.createComponentWithOptions(baseComp.name,args);const te=nwm.getTemplateEngine(data._viewsPath);return newComp.render(te);})()}`;
            } else {
                // @component(variable, { args })
                const jsExpr = this.convertBladeExpression(componentExpr);
                const jsArgs = this.convertObjectLiteral(argsObj.trim());
                result += `\${(function(){const nwm=data._nodeWireManager;if(!nwm){return'';}const baseComp=${jsExpr};if(!baseComp||typeof baseComp!=='object'||!baseComp.name){return'';}const args=${jsArgs};const newComp=nwm.createComponentWithOptions(baseComp.name,args);const te=nwm.getTemplateEngine(data._viewsPath);return newComp.render(te);})()}`;
            }
            
            lastIndex = parenEnd;
        }
        
        result += content.substring(lastIndex);
        content = result;
        
        // Procesar nombres de string sin argumentos: @component('componentName')
        // Solo procesar si NO tiene @endcomponent después (los que tienen @endcomponent ya fueron procesados en processComponents)
        content = content.replace(/@component\s*\(\s*['"]([^'"]+)['"]\s*\)/g, (match, componentName, offset, string) => {
            // Verificar si hay @endcomponent después de este @component
            const afterMatch = string.substring(offset + match.length);
            if (afterMatch.match(/@endcomponent/)) {
                // Tiene @endcomponent, ya fue procesado en processComponents, dejarlo como está
                return match;
            }
            return `\${(function(){const c=data.${componentName};if(!c||typeof c!=='object'||!c.render||typeof c.render!=='function'){return'';}const nwm=data._nodeWireManager;if(!nwm){return'';}const te=nwm.getTemplateEngine(data._viewsPath);return c.render(te);})()}`;
        });
        
        // Finalmente procesar variables directas sin argumentos: @component(variable)
        content = content.replace(/@component\s*\(\s*([^)]+)\s*\)/g, (match, componentExpr) => {
            // Si ya fue procesado (contiene data. o comillas), saltarlo
            if (componentExpr.includes('data.') || componentExpr.includes("'") || componentExpr.includes('"') || componentExpr.includes('{')) {
                return match;
            }
            const jsExpr = this.convertBladeExpression(componentExpr.trim());
            return `\${(function(){const c=${jsExpr};if(!c||typeof c!=='object'||!c.render||typeof c.render!=='function'){return'';}const nwm=data._nodeWireManager;if(!nwm){return'';}const te=nwm.getTemplateEngine(data._viewsPath);return c.render(te);})()}`;
        });

        return content;
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
        
        // Obtener variables de loop que no deben convertirse
        const loopVariables = (this as any)._loopVariables as Set<string> || new Set<string>();
        
        // Palabras clave de JavaScript que no deben convertirse
        const jsKeywords = new Set(['true', 'false', 'null', 'undefined', 'this', 'new', 'typeof', 'instanceof', 'in', 'of', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'function', 'var', 'let', 'const']);
        
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
        
        // Primero procesar propiedades anidadas (ej: example.test.property o component.$loading)
        // Buscar patrones que tengan al menos un punto
        // Permite variables que empiecen con $ después del punto
        const nestedRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*\.[\$a-zA-Z_][\$a-zA-Z0-9_]*(?:\.[\$a-zA-Z_][\$a-zA-Z0-9_]*)*)\b/g;
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
            
            // Si la primera parte es una variable de loop, no convertir
            if (loopVariables.has(firstPart)) {
                // Es una variable local del loop, dejar como está
                continue;
            }
            
            const rest = parts.slice(1).join('.');
            const replacement = `data.${firstPart}.${rest}`;
            replacements.push({ start: matchStart, end: matchEnd, replacement });
            processedRanges.push({ start: matchStart, end: matchEnd });
        }
        
        // Ahora procesar variables simples (sin puntos)
        // Permite variables que empiecen con $
        const simpleVarRegex = /\b([\$a-zA-Z_][\$a-zA-Z0-9_]*)\b/g;
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
            
            // Si es una variable de loop, no convertir
            if (loopVariables.has(varName)) {
                // Es una variable local del loop, dejar como está
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

    /**
     * Convierte un objeto literal de Blade a JavaScript
     * Ejemplo: { initialValue: user.id } -> { initialValue: user.id }
     * Procesa las expresiones dentro del objeto pero mantiene la estructura
     */
    private convertObjectLiteral(objLiteral: string): string {
        // Remover las llaves externas para procesar el contenido
        const trimmed = objLiteral.trim();
        if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
            // Si no es un objeto literal, usar convertBladeExpression normal
            return this.convertBladeExpression(objLiteral);
        }
        
        const content = trimmed.slice(1, -1).trim(); // Contenido sin las llaves
        
        if (!content) {
            return '{}';
        }
        
        // Dividir por comas, pero respetando comas dentro de objetos/arrays anidados
        const properties: string[] = [];
        let currentProp = '';
        let depth = 0;
        let inString = false;
        let stringChar = '';
        
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            
            // Manejar strings
            if (!inString && (char === '"' || char === "'")) {
                inString = true;
                stringChar = char;
                currentProp += char;
            } else if (inString && char === stringChar && content[i - 1] !== '\\') {
                inString = false;
                currentProp += char;
            } else if (!inString) {
                // Contar profundidad de objetos/arrays
                if (char === '{' || char === '[') {
                    depth++;
                    currentProp += char;
                } else if (char === '}' || char === ']') {
                    depth--;
                    currentProp += char;
                } else if (char === ',' && depth === 0) {
                    // Coma al nivel superior, dividir propiedad
                    properties.push(currentProp.trim());
                    currentProp = '';
                } else {
                    currentProp += char;
                }
            } else {
                currentProp += char;
            }
        }
        
        // Agregar la última propiedad
        if (currentProp.trim()) {
            properties.push(currentProp.trim());
        }
        
        // Procesar cada propiedad: key: value
        const processedProps = properties.map(prop => {
            const colonIndex = prop.indexOf(':');
            if (colonIndex === -1) {
                // Propiedad sin valor, usar convertBladeExpression
                return this.convertBladeExpression(prop.trim());
            }
            
            const key = prop.substring(0, colonIndex).trim();
            const value = prop.substring(colonIndex + 1).trim();
            
            // Convertir el valor (puede ser una expresión compleja)
            const convertedValue = this.convertBladeExpression(value);
            
            return `${key}: ${convertedValue}`;
        });
        
        return `{ ${processedProps.join(', ')} }`;
    }
}
