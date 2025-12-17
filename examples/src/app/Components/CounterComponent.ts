import { Component } from "framework-mvc-nodewire";

export class CounterComponent extends Component {
  public count: number = 0;
  public view: string = "components/counter";
  public loading: boolean = false;

  constructor(initialValue: number = 0, id?: string) {
    super("CounterComponent", id);
    this.count = initialValue;
  }

  public increment(value: number = 1): void {
    console.log("increment", value);
    this.count += value;
    console.log(`[NodeWire] Contador incrementado a ${this.count}`);
  }

  public async decrement(): Promise<void> {
    this.loading = true;
    try {
      await new Promise((res) => setTimeout(res, 3000)); // tu espera
      this.count -= 1;
    } finally {
      this.loading = false;
    }
    console.log(`[NodeWire] Contador decrementado a ${this.count}`);
  }

  public reset(): void {
    this.count = 0;
    console.log(`[NodeWire] Contador reseteado`);
  }
}
