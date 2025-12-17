import { Component } from 'framework-mvc-nodewire';

export class CounterComponent extends Component {
    public count: number = 0;

    constructor(initialValue: number = 0, id?: string) {
        super('CounterComponent', id);
        this.count = initialValue;
    }

    public increment(value: number = 1): void {
        console.log('increment', value);
        this.count += value;
        console.log(`[NodeWire] Contador incrementado a ${this.count}`);
    }

    public decrement(): void {
        this.count -= 1;
        console.log(`[NodeWire] Contador decrementado a ${this.count}`);
    }

    public reset(): void {
        this.count = 0;
        console.log(`[NodeWire] Contador reseteado`);
    }

    public render(templateEngine: any): string {
        return templateEngine.render('components/counter', { component: this });
    }
}

