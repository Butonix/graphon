import * as Dom from '../utils/dom.js';
import Graph from './graph.js';
import Tooltip from "./tooltip";
import Pointer from "./pointer";
import * as Event from '../utils/event.js';

import log from '../utils/log.js';
import * as Numbers from "../utils/numbers";
import Bar from "./bar";

/**
 * Module for working with main Chart zone
 * - Render UI
 * - Render axes
 * - Render graphs
 * - Toggle lines visibility
 */
export default class Chart {
  /**
   * @param {Telegraph} modules
   */
  constructor(modules){
    this.modules = modules;
    /**
     * @param {State} state
     */
    this.state = modules.state;
    this.nodes = {
      wrapper: undefined,
      viewport: undefined,
      canvas: undefined,
      cursorLine: undefined,
      grid: undefined,
      gridLines: [],
      legend: undefined,
      legendDates: [],
      overlays: undefined,
      overlayLeft: undefined,
      overlayRight: undefined,

    };

    this.tooltip = new Tooltip(this.modules);
    this.pointer = new Pointer(this.modules);
    this.graph = new Graph(this.modules, {
      stroke: 2
    });

    this.wrapperLeftCoord = undefined;
    this.scaling = 1;
    this.scrollValue = 0;



    this.legendDateWidth = 40;
    this.legendDateWidthMargins = 20 * 2;
    this.legendDatesHidedTimes = 0;
    this.legendDatesRecentlyHided = false;


    /**
     * Set will be store indexes of visible dates
     * @type {Set<number>}
     */
    this.onscreenDates = new Set();
    this.onscreenDatesElements = {}; // origin index -> element mapping
    this._datesPerScreenInitial = undefined;
    this._showEveryNDateInitial = undefined;

    /**
     * Any properties can be cached here
     * @type {{}}
     */
    this.cache = {};

    this._initialScale = undefined;
    this._initialStep = undefined;
  }

  get initialStep(){
    if (!this._initialStep){
      this._initialStep = this.width / (this.state.daysCount - 1);
    }
    return this._initialStep;
  }

  get minimalMapWidth(){
    // return 2 * this.initialStep;
    return 50;
  }

  get initialScale(){
    return this._initialScale;
  }

  /**
   * Get initial scaling corresponded with minimal minimap width
   */
  calculateInitialValues(){
    /**
     * Width of viewport when chart is not scaled
     * @type {number}
     */
    const chartToViewportRatio = this.viewportWidth / this.width;
    const originalWidth = this.viewportWidth * chartToViewportRatio;
    const scaledViewportRatio = this.minimalMapWidth / originalWidth;

    const originalScalingChange = this.scaling / scaledViewportRatio;

    this.initialScale = originalScalingChange;

    // log({scaling: this.scaling});
  }

  set initialScale(value){
    this._initialScale = value;
    this.scale(value);
  }

  /**
   * CSS map
   * @return {{wrapper: string, viewport: string, cursorLine: string}}
   */
  static get CSS(){
    return {
      wrapper: 'tg-chart',
      viewport: 'tg-chart__viewport',
      grid: 'tg-grid',
      gridSection: 'tg-grid__section',
      gridSectionHidden: 'tg-grid__section--hidden',
      gridCounter: 'tg-grid__counter',
      gridCounterSecond: 'tg-grid__counter--second',
      dateHidden: 'tg-legend__date--hidden',
      overlays: 'tg-chart__overlays',
      overlayLeft: 'tg-chart__overlay-left',
      overlayRight: 'tg-chart__overlay-right',
    }
  }

  get stepX(){
    return this.graph.stepX;
  }

  get stepY(){
    return this.graph.stepY;
  }

  get maxPoint(){
    return this.graph.maxPoint;
  }

  get height(){
    return this.graph.height;
  }

  /**
   * Total chart width
   * @return {number}
   */
  get width(){
    return this.graph.width;
  }

  /**
   * Return current scroll distance
   * @return {number}
   */
  get scrollDistance() {
    return this.scrollValue * this.scaling;
  }

  /**
   * Visible viewport width
   * @return {number}
   */
  get viewportWidth(){
    if (this.cache.viewportWidth){
      return this.cache.viewportWidth;
    }

    this.cache.viewportWidth = this.nodes.wrapper.offsetWidth;
    return this.cache.viewportWidth;
  }

  /**
   * Visible viewport height
   * @return {number}
   */
  get viewportHeight(){
    if (this.cache.viewportHeight){
      return this.cache.viewportHeight;
    }

    this.cache.viewportHeight = this.nodes.wrapper.offsetHeight;
    return this.cache.viewportHeight;
  }

  /**
   * Prepare UI
   * @return {Element}
   */
  renderUi(){
    this.nodes.wrapper = Dom.make('div', Chart.CSS.wrapper);
    this.nodes.viewport = Dom.make('div', Chart.CSS.viewport);
    this.nodes.cursorLine = this.pointer.render();

    this.nodes.wrapper.appendChild(this.nodes.viewport);
    this.nodes.wrapper.appendChild(this.nodes.cursorLine);

    this.nodes.wrapper.appendChild(this.tooltip.render());

    this.nodes.wrapper.classList.add(Chart.CSS.wrapper + '--' + this.state.type);

    this.bindEvents();

    return this.nodes.wrapper;
  }

  /**
   * Renders charts
   */
  renderCharts(){
    this.calculateWrapperCoords();

    /**
     * @todo pass height through the initial settings
     */
    this.nodes.canvas = this.graph.renderCanvas({
      height: 350
    });
    this.nodes.viewport.appendChild(this.nodes.canvas);

    /**
     * Get initial scale
     */
    this.calculateInitialValues();



    this.graph.renderCharts();
    this.renderGrid();
    this.renderLegend();
    this.renderOverlays();
  }

  createLine(){
    const line = Dom.make('div', Chart.CSS.gridSection);
    this.nodes.grid.appendChild(line);
    this.nodes.gridLines.push(line);

    return line;
  }

  getLegendStep(max, min, stepsCount, kY, kYRatio){
    let diffSize = max - min;
    let step = diffSize / stepsCount;
    let decimals = Math.log10(diffSize) >> 0;
    let rounding = Math.pow(10, decimals) / 2;
    // console.log('step', step);

    step = Math.ceil(step / rounding) * rounding;

    let possibleHeight = step * stepsCount * kY;

    if (possibleHeight > this.height){
      step = step / (possibleHeight / this.height >> 0);
    }

    return step;
  }

  getLegendCounter(value, isSecond){
    let counter = Dom.make('span', Chart.CSS.gridCounter);
    counter.textContent = Numbers.beautify(Math.round(value));

    if (isSecond){
      counter.classList.add(Chart.CSS.gridCounterSecond);
    }

    return counter;
  }

  /**
   * Render or updates a grid
   */
  renderGrid(){
    if (!this.nodes.grid) {
      this.nodes.grid = Dom.make('div', Chart.CSS.grid);
      this.nodes.gridLines = [];
      Dom.insertBefore(this.nodes.canvas, this.nodes.grid);
    }

    let height = this.height;
    let max = this.getMaxVisiblePoint();
    let min = !this.state.isYScaled ? this.graph.currentMinimum || 0 : this.graph.charts['y0'].currentMinimum;
    let kY = height / (max - min);
    let linesCount = 5;
    let stepY = this.getLegendStep(max, min, linesCount, kY);


    // console.log('stepY', stepY);

    let stepYSecond, kYSecond, maxSecond, minSecond;

    if (this.state.isYScaled){
      maxSecond = this.getMaxVisiblePoint('y1');
      minSecond = this.getMinVisiblePoint('y1');

      kYSecond = height / (maxSecond - minSecond);
      let kYRatio = kY / kYSecond;
      // let kYRatio = kY / kYSecond;
      // console.log('ky %o / ky2 %o = %o', kY , kYRatio, kY/kYSecond )

      stepYSecond = this.getLegendStep(maxSecond, minSecond, linesCount, kYSecond, kYRatio);
      // console.log('maxSecond',maxSecond , 'minSecond', minSecond, 'kYSecond', kYSecond, kYRatio, 'stepYSecond', stepYSecond);
      //
      // let oldStyle = this.graph.charts['y1'].path.style.transform;
      //
      // if (oldStyle){
      //   let oldScale = oldStyle.match(/scaleY\((\S+)\)/);
      //   let newScale = parseFloat(oldScale[1]) - parseFloat(oldScale[1])  * kYRatio;
      //   let newZeroShifting = minSecond * kY;
      //   console.log('oldStyle', oldStyle, parseFloat(oldScale[1]), newScale);
      //   this.graph.charts['y1'].path.style.transform = oldStyle.replace(/scaleY\(\S+\)/, `scaleY(${newScale})`);
      // }
    }

    if (this.state.type === 'area'){
      stepY = 25;
      linesCount = 5;
      max = 100;
      kY = height / max;
    }

    if (this.nodes.gridLines.length){
      this.nodes.gridLines.forEach( line => {
        line.classList.add(Chart.CSS.gridSectionHidden);
      })
    }

    for (let j = 0; j <= linesCount; j++) {
      let y = j * stepY;
      let line;

      if (this.nodes.gridLines.length && this.nodes.gridLines[j]){
        line = this.nodes.gridLines[j];
      } else {
        line = this.createLine();
      }

      if (j === 0){
        line.classList.add('no-animation');
      }

      let bottom = y * kY;

      if (bottom > this.height){
        return;
      }

      line.classList.remove(Chart.CSS.gridSectionHidden);
      line.style.bottom = `${y * kY}px`;

      line.innerHTML = '';

      let counter = this.getLegendCounter(y + min);
      line.appendChild(counter);

      if (stepYSecond){
        counter.style.color = this.state.getLineColor('y0');
        let kYRatio = kY / kYSecond;
        let counter2 = this.getLegendCounter((j * stepYSecond + minSecond), true);
        counter2.style.color = this.state.getLineColor('y1');
        line.appendChild(counter2);
      }
    }
  }

  moveDate(originalIndex, visibleIndex){
    let centering = 'translateX(-50%)';

    if (visibleIndex === 0){
      // centering = '';
    } else if (visibleIndex === this.datesPerScreen - 1){
      // centering = '';
    }


    let dateEl = this.onscreenDatesElements[originalIndex];
    let newX = originalIndex * this.stepScaled + this.scrollValue;

    dateEl.style.transform = `translateX(${ newX }px)` + centering;

    // let skippedCount = Math.floor(Math.floor(this.onscreenPointsCount / this.datesPerScreen) / this.datesPerScreen);
    let skippedCount = Math.round(((this.onscreenPointsCount / this.datesPerScreen ) - this._showEveryNDateInitial) / this._showEveryNDateInitial);
    let checks = [];

    // console.warn(this.onscreenPointsCount, this.datesPerScreen, newX, )

    log({
      step: this.stepScaled,
      skippedCount: skippedCount,
    });


    let leftReached = newX < ((this.viewportWidth / this.datesPerScreen) / 2) * visibleIndex;
    //
    // if (originalIndex === 14){
    //   console.log(originalIndex, visibleIndex, newX);
    // }
    //
    // let check = (originalIndex + this._showEveryNDateInitial) % (this._showEveryNDateInitial * 2) === 0;
    // if (leftReached && check){
    //   dateEl.style.opacity = '0.1';
    // } else {
    //   dateEl.style.opacity = '1';
    // }



    // console.log('leftReached', leftReached);
    //
    // if (leftReached){
    //   dateEl.style.opacity = '0.5';
    // }

    for (let i = 1; i < skippedCount + 1; i++){
      let idxToCheck = originalIndex + i * this._showEveryNDateInitial;
      let check = idxToCheck % (this._showEveryNDateInitial * 2 * i) === 0;
      checks.push(check)
    }

    if (checks.some(check => !!check)){
      dateEl.style.opacity = '0';
    } else {
      dateEl.style.opacity = '1';
    }
  }


  pushDate(date, originIndex, visibleIndex){
    const dt = new Date(date);
    const dateEl = Dom.make('time');
    dateEl.textContent = dt.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short'
    });

    // dateEl.textContent = originIndex;

    this.nodes.legend.appendChild(dateEl);
    this.nodes.legendDates.push(dateEl);
    this.onscreenDates.add(originIndex);
    this.onscreenDatesElements[originIndex] = dateEl;
    this.moveDate(originIndex, visibleIndex);
  }

  get onscreenPointsCount(){
    return Math.floor(this.viewportWidth / this.stepScaled);
  }

  /**
   * Left visible point
   * @return {number}
   */
  get leftPointIndex(){
    return parseInt(Math.floor(this.scrollValue * -1/ this.stepX / this.scaling));
  }

  /**
   * Right visible point
   * @return {number}
   */
  get rightPointIndex(){
    return this.leftPointIndex + this.onscreenPointsCount;
  }

  get datesPerScreen(){
    if (!this._datesPerScreenInitial){
      this._datesPerScreenInitial = Math.floor(this.viewportWidth / (this.legendDateWidth + this.legendDateWidthMargins));
    }
    return this._datesPerScreenInitial;
  }

  get stepScaled(){
    return this.stepX * this.scaling
  }

  scaleDates(){
    // let visibleIndex = 0;
    // this.onscreenDates.forEach((originalIndex) => {
    //   this.moveDate(originalIndex, visibleIndex);
    //   visibleIndex++;
    // });

    this.addOnscreenDates();
  }

  addOnscreenDates(){
    /**
     * Get slice of timestamps that currently visible on the screen
     */
    let datesOnScreenSlice = this.state.dates.slice(this.leftPointIndex, this.rightPointIndex + 2);
    let datesOnScreenIndexes = new Set();

    if (!this._showEveryNDateInitial){
      let pointsOnScreen = this.rightPointIndex - this.leftPointIndex;
      this._showEveryNDateInitial = Math.ceil(pointsOnScreen / this.datesPerScreen);
      console.log('this._showEveryNDateInitial', this._showEveryNDateInitial);
    }

    let visibleIndex = 0;

    datesOnScreenSlice.forEach((date, index) => {
      const originIndex = this.leftPointIndex + index;


      /**
       * Skip dates that can not be fit event on maximum zoom
       */
      if (originIndex % this._showEveryNDateInitial !== 0){
        return;
      }

      /**
       * Store index of added date to check if it out of screen
       */
      datesOnScreenIndexes.add(originIndex);

      /**
       * If point already showed, move it
       */
      if (this.onscreenDates.has(originIndex)){
        this.moveDate(originIndex, visibleIndex);
        visibleIndex++;
        return
      }

      /**
       * Add new date to its position computed by original index * step scaled
       */
      this.pushDate(date, originIndex, visibleIndex);
      visibleIndex++;
    });

    /**
     * Remove dates that are out of screen
     */
    this.onscreenDates.forEach((originalIndex) => {
      if (!datesOnScreenIndexes.has(originalIndex)) {
        this.removeDate(originalIndex);
      }
    });
  }

  removeDate(originalIndex){
    this.onscreenDatesElements[originalIndex].remove();
    this.onscreenDates[originalIndex] = null;
    this.onscreenDates.delete(originalIndex);
    this.onscreenDatesElements[originalIndex] = null;
    delete this.onscreenDatesElements[originalIndex];
  }

  /**
   * Renders a legend with dates
   * @param {number[]} dates
   */
  renderLegend(){
    this.nodes.legend = Dom.make('footer');

    // this.addOnscreenDates();

    Dom.insertAfter(this.nodes.canvas, this.nodes.legend);
  }

  /**
   * Perform scroll
   * @param position
   */
  scroll(position, fromScale){
    this.scrollValue = position * -1;
    this.graph.scroll(this.scrollValue);
    // this.nodes.legend.style.transform = `translateX(${this.scrollValue}px)`;
    this.tooltip.hide();
    this.pointer.hide();

    if (!fromScale){
      this.addOnscreenDates();
    } else {
      this.scaleDates();
    }
  }

  scrollByDelta(delta){
    this.scroll(this.scrollValue + delta);
  }

  /**
   * Perform scaling
   * @param {number} scaling
   */
  scale(scaling, direction){
    this.graph.scaleLines(scaling, direction);

    // log({scaling});

    this.scaling = scaling;
  }

  /**
   * Left visible point
   * @return {number}
   */
  get leftPointIndex(){
    return Math.round(this.scrollValue * -1/ this.graph.step / this.scaling);
  }

  /**
   * Filter to skip hidden line
   * @param {string} line - name of the graph
   * @return {boolean}
   */
  notHiddenGraph(line){
    return this.graph.checkPathVisibility(line);
  }

  get pointsVisible(){
    const stepX = this.graph.step;
    return Math.round(this.viewportWidth / stepX / this.scaling);
  }

  /**
   * Return max visible point
   * If line passed, check for that. Otherwise, return maximum between all
   */
  getMaxVisiblePoint(line = undefined){
    return this.graph.getMaxFromVisible(this.leftPointIndex, this.pointsVisible, line);
  }

  /**
   * Return min visible point
   * If line passed, check for that. Otherwise, return maximum between all
   */
  getMinVisiblePoint(line = undefined){
    if (!line){
      return Math.min(...this.state.linesAvailable.filter(line => this.notHiddenGraph(line)).map(line => {
        return this.state.getMinForLineSliced(line, this.leftPointIndex, this.pointsVisible);
      }));
    }

    return this.state.getMinForLineSliced(line, this.leftPointIndex, this.pointsVisible);
  }

  /**
   * Upscale or downscale graph to fit visible points
   */
  fitToMax(){
    if (this.state.type !== 'area'){
      if (!this.state.isYScaled){
        this.graph.scaleToMaxPoint(this.getMaxVisiblePoint(), this.getMinVisiblePoint());
      } else {
        this.state.linesAvailable.filter(line => this.notHiddenGraph(line)).forEach((line) => {
          this.graph.scaleToMaxPoint(this.getMaxVisiblePoint(line), this.getMinVisiblePoint(line), line);
        })
      }
    }

    /**
     * Rerender grid if it was rendered before
     */
    if (this.nodes.grid){
      this.renderGrid();
    }
  }

  /**
   * Store wrapper rectangle data
   */
  calculateWrapperCoords(){
    let rect = this.nodes.wrapper.getBoundingClientRect();

    this.wrapperLeftCoord = rect.left;
  }

  bindEvents(){
    this.nodes.wrapper.addEventListener('mousemove', (event) => {
      this.mouseMove(event);
    });

    this.nodes.wrapper.addEventListener('mouseleave', (event) => {
      this.mouseLeave(event);
    });

    this.nodes.wrapper.addEventListener('touchmove', (event) => {
      this.mouseMove(event);
    });

    this.nodes.wrapper.addEventListener('touchcancel', (event) => {
      this.mouseLeave(event);
    });
  }

  /**
   * Shows line with Tooltip
   * @param {MouseEvent|TouchEvent} event
   */
  mouseMove(event){
    let x = Event.getPageX(event);
    let viewportX = x - this.wrapperLeftCoord;

    let stepXWithScale = this.graph.stepX * this.scaling;
    let scrollOffset = this.scrollValue % stepXWithScale;
    let pointIndex = Math.round(viewportX / this.graph.stepX / this.scaling);
    let hoveredPointIndex = pointIndex + this.leftPointIndex;
    // let firstStepOffset = this.graph.stepX - Math.abs(scrollOffset);

    if (Math.abs(scrollOffset) > (stepXWithScale / 2) ){
      pointIndex = pointIndex + 1;
    }

    let newLeft = pointIndex * stepXWithScale + scrollOffset;

    // console.log('scroll offset %o | step %o (%o)| index %o | x %o | drawn at %o | first step offset %o | left index %o ', scrollOffset, this.graph.stepX, stepXWithScale, pointIndex, viewportX, newLeft, firstStepOffset, this.leftPointIndex);

     if (newLeft < this.stepScaled * 2){
       // let old = this.scrollValue;
       // let newScroll = (this.scrollValue + 20) * -1;

       //scroll
       //
       // this.modules.minimap.moveViewport(-1 * (old*-1 - newScroll));
       // this.scroll(newScroll);
     }

    this.tooltip.show();

    if (this.state.type === 'bar'){
      this.highlightBar(pointIndex -1, scrollOffset);
    } else {
      this.pointer.move(newLeft);
    }

    const values = this.state.linesAvailable.filter(line => this.notHiddenGraph(line)).map( line => {
      return {
        name: line,
        value: this.state.getLinePoints(line)[hoveredPointIndex]
      }
    });

    /**
     * Show circles
     */
    this.pointer.showValues(values);

    const date = this.state.dates[hoveredPointIndex];

    /**
     * Skip bounding empty positions
     */
    if (!date){
      return;
    }

    this.tooltip.values = values;
    this.tooltip.move(newLeft);
    this.tooltip.title = (new Date(date)).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      weekday: 'short'
    });
  }

  mouseLeave(){
    this.tooltip.hide();
    this.pointer.hide();
    this.hideOverlays();
  }

  /**
   * Toggle path visibility
   * @param {string} name - graph name
   */
  togglePath(name){
    this.pointer.toggleVisibility(name);
    this.graph.togglePathVisibility(name);
    if (this.state.type === 'bar'){
      this.graph.recalculatePointsHeight();
      this.fitToMax();
    } else if (this.state.type === 'area') {
      this.graph.recalculatePointsHeight();
    } else {
      this.fitToMax();
    }
  }

  highlightBar(index, scrollOffset){
    this.nodes.overlays.style.opacity = '1';
    this.nodes.overlayLeft.setAttribute('width', index * this.stepScaled + scrollOffset);
    this.nodes.overlayRight.setAttribute('x', index * this.stepScaled + this.stepScaled + scrollOffset );
    this.nodes.overlayRight.setAttribute('width', (this.onscreenPointsCount - index) * this.stepScaled - scrollOffset );
  }

  renderOverlays(){
    this.nodes.overlays = Dom.make('g');
    this.nodes.overlays.setAttribute('class', Chart.CSS.overlays);


    this.nodes.overlayLeft = Dom.make('rect');
    this.nodes.overlayLeft.setAttribute('class', Chart.CSS.overlayLeft);
    this.nodes.overlayRight = Dom.make('rect');
    this.nodes.overlayRight.setAttribute('class', Chart.CSS.overlayRight);

    let defaultWidth = 0;

    this.nodes.overlayLeft.setAttribute('x', 0);
    this.nodes.overlayRight.setAttribute('x', this.viewportWidth - defaultWidth);
    this.nodes.overlayLeft.setAttribute('y', 0);
    this.nodes.overlayRight.setAttribute('y', 0);
    this.nodes.overlayLeft.setAttribute('width', defaultWidth);
    this.nodes.overlayRight.setAttribute('width', defaultWidth);
    this.nodes.overlayLeft.setAttribute('height', this.viewportHeight);
    this.nodes.overlayRight.setAttribute('height', this.viewportHeight);

    this.nodes.overlays.appendChild(this.nodes.overlayLeft);
    this.nodes.overlays.appendChild(this.nodes.overlayRight);
    this.graph.canvas.appendChild(this.nodes.overlays);
  }

  hideOverlays(){
    this.nodes.overlays.style.opacity = 0;
  }

}