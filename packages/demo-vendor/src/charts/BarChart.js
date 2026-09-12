export default class BarChart {
  constructor(props = {}) { this.bars = props.bars ?? []; }
  toString() { return `BarChart(${this.bars.length} bars)`; }
}
