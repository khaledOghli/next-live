export default class Widget {
  constructor(props = {}) { this.label = props.label ?? 'widget'; }
  toString() { return `Widget(${this.label})`; }
}
