import * as Dom from '../utils/dom.js';
import * as Numbers from '../utils/numbers';

export default class Tooltip {
  /**
   * @param {Telegraph} modules
   */
  constructor(modules){
    this.modules = modules;
    this.nodes = {
      wrapper:  undefined,
      title: undefined,
      values: undefined
    };

    this._width = 0;
    this._values = [];
  }

  /**
   * CSS map
   * @return {{wrapper: string, title: string, values: string, value: string}}
   */
  static get CSS(){
    return {
      wrapper: 'tg-tooltip',
      showed: 'tg-tooltip--showed',
      title: 'tg-tooltip__title',
      values: 'tg-tooltip__values',
      value: 'tg-tooltip__values-item',
    }
  }

  render(){
    this.nodes.wrapper = Dom.make('div', Tooltip.CSS.wrapper);
    this.nodes.title = Dom.make('div', Tooltip.CSS.title);
    this.nodes.values = Dom.make('div', Tooltip.CSS.values);

    this.nodes.wrapper.appendChild(this.nodes.title);
    this.nodes.wrapper.appendChild(this.nodes.values);

    return this.nodes.wrapper;
  }

  show(){
    this.nodes.wrapper.classList.add(Tooltip.CSS.showed);
  }

  hide(){
    this.nodes.wrapper.classList.remove(Tooltip.CSS.showed);
  }

  move(lineLeftCoord, values){
    if (!this._width){
      this._width = this.nodes.wrapper.offsetWidth;
    }

    let max = Math.max(...values.map(value => value.value));
    let maxBottom = max * this.modules.chart.graph.kY - this.modules.chart.graph.zeroShifting;

    let offsetLeft = -25;
    let left = lineLeftCoord + offsetLeft;

    console.log(left);

    if (maxBottom > 260) {
      left = left - this._width;
    }

    if (left < this._width + 25){
      left = lineLeftCoord + 25
    }

    if (left + this._width > this.modules.chart.viewportWidth){
      left = left - this._width;
    }

    //
    // if (left + this._width > this.modules.chart.viewportWidth){
    //   left = this.modules.chart.viewportWidth - this._width - 30;
    // }


    // if (lineLeftCoord > this.modules.chart.viewportWidth - tooltipWidth / 1.3){
    //   offsetLeft = -1.3 * tooltipWidth;
    // } else if (lineLeftCoord > this.modules.chart.viewportWidth - tooltipWidth ){
    //   offsetLeft = -0.8 * tooltipWidth;
    // } else if (lineLeftCoord < 45){
    //   offsetLeft = 20;
    // }

    this.nodes.wrapper.style.left = `${left}px`;
  }

  clear(){
    this.nodes.title.textContent = '';
    this.nodes.values.innerHTML = '';
  }

  /**
   * Render values of current hovered points
   * @param {{name: string, value: number}[]} values
   */
  set values(values){
    this.clear();

    const prevValues = this._values;

    this._values = [];

    values.forEach( ({name, value}, index) => {
      const item = Dom.make('div', Tooltip.CSS.value);
      const color = this.modules.state.colors[name];
      const title = this.modules.state.names[name];
      const counter = Dom.make('b');

      item.textContent = title;
      item.appendChild(counter);

      counter.style.color = color;

      let valueBeautified = Numbers.addSpaces(value);

      setTimeout(() => {
        Dom.animateCounter(counter, valueBeautified, prevValues[index]);
      }, 50 * index);


      this.nodes.values.appendChild(item);
      this._values.push(valueBeautified);
    });
  }

  set title(string){
    this.nodes.title.innerHTML = string;
  }

  /**
   * @param {Date} dt
   */
  set date(dt){
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const week = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let month = dt.getMonth();
    let year = dt.getFullYear();
    let weekday = dt.getDay();
    let day = dt.getDate();
    let left = Dom.make('span', 'left');
    let right = Dom.make('span');

    right.textContent = months[month] + ' ' +year;


    this.nodes.title.innerHTML = '';
    this.nodes.title.appendChild(left);
    this.nodes.title.appendChild(right);

    let newDate = `${week[weekday]}, ${day}`;


    Dom.animateCounter(left, `${week[weekday]}, ${day}`, this._prevDate, 'top' );
    this._prevDate = newDate
  }
}