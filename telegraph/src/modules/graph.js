import * as Dom from '../utils/dom';
import * as Numbers from '../utils/numbers';
import Path from './path';

/**
 * Working with svg paths for charts
 */
export default class Graph {
  /**
   * @param {State} state
   */
  constructor(state, {stroke}){
    /**
     * Width of date label is used for default stepX value in 1:1 scale
     * @type {number}
     */
    const dateLabelWidth = 45;

    this.state = state;
    /**
     * @todo move to this.nodes
     */
    this.canvas = undefined;
    this.legend = undefined;
    this.grid = undefined;
    this.gridLines = [];


    this.stepX = dateLabelWidth;
    this.stepY = 10;
    this.strokeWidth = stroke;
    this.initialWidth = undefined;
    this.maxPoint = this.state.max * 1.2; // 20% for padding top

    /**
     * List of drawn lines
     * @type {object} name -> Path
     */
    this.paths = {};
  }

  static get CSS(){
    return {
      grid: 'tg-grid',
      gridSection: 'tg-grid__section',
      gridSectionHidden: 'tg-grid__section--hidden'
    }
  }

  /**
   * Return Graph's paths as array
   * @return {Path[]}
   */
  get pathsList(){
    return Object.entries(this.paths).map(([name, path]) => {
      return path;
    });
  }


  /**
   * Prepares the SVG element
   * @param {number} [width] - strict canvas width
   * @param {number} [height] - strict canvas height
   * @return {SVGElement}
   */
  renderCanvas({width, height} = {}){
    this.canvas = Dom.make('svg');

    if (!width){
      this.setCanvasWidth();
    } else {
      this.canvas.style.width = width + 'px';
      this.initialWidth = width;
    }

    if (height){
      this.canvas.style.height = height + 'px';
    }

    this.computeSteps();

    return this.canvas;
  }

  /**
   * Compute and set initial canvas width
   */
  setCanvasWidth(){
    this.initialWidth = this.state.daysCount * this.stepX;
    this.canvas.style.width = this.initialWidth + 'px';
  }

  /**
   * Return total (big) chart width
   * @return {number}
   */
  get width(){
    return parseInt(this.canvas.style.width, 10);
  }

  /**
   * Return chart height
   * @return {number}
   */
  get height(){
    return parseInt(this.canvas.style.height, 10);
  }

  /**
   * Calculates stepX by canvas width and total points count
   */
  computeSteps(){
    this.stepX = parseInt(this.canvas.style.width, 10) / this.state.daysCount;

    /**
     * All lines maximum value
     */
    const max = this.state.max;
    const stepsAvailable = [1, 10, 100, 1000, 10000, 100000, 1000000, 10000000];
    this.stepY = stepsAvailable.reverse().find( step => max > step );
  }


  /**
   * Renders a line by name
   * @param {string} name - line name ("y0", "y1" etc)
   */
  renderLine(name){
    /**
     * Array of chart Y values
     */
    const values = this.state.getLinePoints(name);

    /**
     * Color of drawing line
     */
    const color = this.state.getLineColor(name);

    /**
     * Point to from which we will start drawing
     */
    const leftPoint = values[0];

    /**
     * Create a Path instance
     */
    const path = new Path({
      svg: this.canvas,
      color,
      max: this.maxPoint,
      stroke: this.strokeWidth,
      stepX: this.stepX,
    });

    path.moveTo(0, leftPoint);

    values.forEach( (column, index )=> {
      if (index === 0){
        // path.dropText(column, true);
        path.stepTo(column, true);
      } else {
        // path.dropText(column);
        path.stepTo(column);
      }

    });

    path.render();

    this.paths[name] = path;
  }

  /**
   * Render or updates a grid
   * @param {number} forceMax - new max value for updating
   * @param {boolean} isUpdating - true for updating
   */
  renderGrid(forceMax, isUpdating = false){
    if (!this.grid) {
      this.grid = Dom.make('div', Graph.CSS.grid);
      this.gridLines = [];
      Dom.insertBefore(this.canvas.parentNode, this.grid);
    }



    let stepY = this.stepY;
    const height = this.height;
    const width = this.width;
    const max = forceMax || this.maxPoint;
    const kY = height / max;

    let linesCount = height / (stepY * kY) >> 0;

    if (linesCount === 0){
      stepY = stepY / 3;
      linesCount = height / (stepY * kY) >> 0;
    }

    if (linesCount === 1){
      stepY = stepY / 2;
      linesCount = height / (stepY * kY) >> 0;
    }

    if (this.gridLines.length){
      this.gridLines.forEach( line => {
        line.classList.add(Graph.CSS.gridSectionHidden);
      })
    }

    // Drawing horizontal lines

    for (let j = 0; j <= linesCount; j++) {
      let y = j * stepY;
      let line;

      if (this.gridLines.length && this.gridLines[j]){
        line = this.gridLines[j];
      } else {
        line = Dom.make('div', Graph.CSS.gridSection);
        this.grid.appendChild(line);
        this.gridLines.push(line);
      }

      if (j === 0){
        line.classList.add('no-animation');
      }

      line.classList.remove(Graph.CSS.gridSectionHidden);
      line.style.bottom = y * kY + 'px';
      line.textContent = Numbers.beautify(Math.round(y));
    }
  }

  /**
   * Renders a legend with dates
   * @param {number[]} dates
   */
  renderLegend(dates){
    this.legend = Dom.make('footer');

    dates.forEach((date, index) => {
      /**
       * Skip every second
       */
      if (index % 2 === 1){
        return;
      }

      const dt = new Date(date);
      const dateEl = Dom.make('time');
      dateEl.textContent = dt.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short'
      });

      this.legend.appendChild(dateEl)
    });

    Dom.insertAfter(this.canvas, this.legend);
  }

  /**
   * Scale left legend
   * @param {number} scaling
   */
  scaleLines(scaling){
    this.pathsList.forEach( path => {
      path.scaleX(scaling);
    });

    const newWidth = this.initialWidth * scaling;
    this.canvas.style.width = newWidth + 'px';

    const canFit = Math.round(newWidth / this.stepX);
    const nowFit = Math.round(this.initialWidth / this.stepX);
    const fitability = Math.floor(nowFit / canFit + 0.9);

    if (fitability % 2 === 1){
      this.legend.classList.add(`skip-${fitability}`);
    }

    this.legend.classList.toggle('skip-odd', nowFit / canFit > 1.7);
    this.legend.classList.toggle('skip-third', nowFit / canFit > 3.2);
    this.legend.classList.toggle('skip-fifth', nowFit / canFit > 5.5);
    this.legend.classList.toggle('skip-seventh', nowFit / canFit > 7);
    this.legend.classList.toggle('skip-ninth', nowFit / canFit > 9.2);
    this.legend.classList.toggle('skip-eleventh', nowFit / canFit > 14);
  }

  get step(){
    return this.stepX;
  }

  /**
   * Scale path on OY
   * @param {number} newMax - new max value
   */
  scaleToMaxPoint(newMax){
    let scaling = this.maxPoint / newMax * 0.8;

    this.pathsList.forEach( path => {
      path.scaleY(scaling);
    });

    /**
     * Rerender grid if it was rendered before
     */
    if (this.grid){
      this.renderGrid(newMax * 1.2, true);
    }
  }

  checkPathVisibility(name){
    return !this.paths[name].isHidden;
  }

  togglePathVisibility(name){
    this.paths[name].toggleVisibility();
  }
}