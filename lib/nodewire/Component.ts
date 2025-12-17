import { v4 as uuidv4 } from 'uuid';

export class Component {
    public id: string;
    public readonly name: string;
    /**
     * Ruta de la vista del componente (ej: 'components/counter')
     * Si no se define, se usa components/{nombre-sin-Component}
     */
    public view?: string;

    constructor(name: string, id?: string) {
        this.id = id || uuidv4();
        this.name = name;
    }

    /**
     * Renderiza el componente usando el motor de plantillas
     * Inyecta automáticamente el estado inicial del componente para el runtime.
     */
    public render(templateEngine: any): string {
        // Resolver la vista: usar propiedad view o fallback components/{nombreSinSuffix}
        const fallbackView = `components/${this.name.toLowerCase().replace(/component$/, '')}`;
        const viewPath = this.view || fallbackView;

        const html = templateEngine.render(viewPath, { component: this });

        // Inyectar estado inicial para el runtime
        const stateJson = JSON.stringify(this.getState());
        const stateScript = `<script type="application/json" data-nodewire-state="${this.id}" data-component-name="${this.name}">${stateJson}</script>`;

        return `${stateScript}${html}`;
    }

    /**
     * Obtiene el estado público del componente que se sincronizará con el cliente
     * Solo las propiedades marcadas como públicas se enviarán
     */
    public getState(): Record<string, any> {
        const state: Record<string, any> = {};
        const publicProps = this.getPublicProperties();
        
        for (const prop of publicProps) {
            state[prop] = (this as any)[prop];
        }
        
        return state;
    }

    /**
     * Restaura el estado del componente desde el cliente
     */
    public setState(state: Record<string, any>): void {
        const publicProps = this.getPublicProperties();
        
        for (const prop of publicProps) {
            if (state.hasOwnProperty(prop)) {
                (this as any)[prop] = state[prop];
            }
        }
    }

    /**
     * Obtiene las propiedades públicas del componente
     * Por defecto, todas las propiedades que no empiezan con _ son públicas
     */
    private getPublicProperties(): string[] {
        const props: string[] = [];
        let obj: any = this;
        
        do {
            Object.getOwnPropertyNames(obj).forEach(prop => {
                // Ignorar propiedades privadas (empiezan con _) y métodos
                if (prop.startsWith('_') || prop === 'id' || prop === 'name') {
                    return;
                }
                
                // Solo incluir propiedades, no métodos
                const descriptor = Object.getOwnPropertyDescriptor(obj, prop);
                if (descriptor && !descriptor.get && typeof (this as any)[prop] !== 'function') {
                    if (!props.includes(prop)) {
                        props.push(prop);
                    }
                }
            });
            obj = Object.getPrototypeOf(obj);
        } while (obj && obj !== Object.prototype);
        
        return props;
    }
}

