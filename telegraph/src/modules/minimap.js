import * as Dom from '../utils/dom.js';
import * as Event from '../utils/event.js';
import debounce from '../utils/debounce.js';
import Graph from './graph.js';


/**
 * Module for working with Chart Mini map
 * - Render UI
 * - Render graphs
 * - Scaling
 * - Scrolling
 */
export default class Minimap {
  /**
   * Telegraph
   * @param modules
   */
  constructor(modules){
    this.modules = modules;
    /**
     * @param {State} state
     */
    this.state = modules.state;
    this.nodes = {
      wrapper: undefined,
      canvas: undefined,

      leftZone: undefined,
      leftZoneScaler: undefined,
      rightZone: undefined,
      rightZoneScaler: undefined,
    };

    this.wrapperWidthCached = undefined;
    this.viewportWidth = 100;
    this.viewportWidthInitial = 100;
    this.viewportOffsetLeft = 0;

    /**
     * Remember width on touch start
     */
    this.viewportWidthBeforeDrag = undefined;

    /**
     * Clicked pageX
     */
    this.moveStartX = undefined;

    /**
     * Clicked layerX
     */
    this.wrapperLeftCoord = undefined;

    /**
     * Indicator that viewport zone is dragged
     */
    this.viewportPressed = false;

    /**
     * Indicator that left scaler zone is dragged
     */
    this.leftScalerClicked = false;

    /**
     * Indicator that right scaler zone is dragged
     */
    this.rightScalerClicked = false;

    /**
     * Scale debounce
     */
    this.scaleDebounce = undefined;

    /**
     * Cache for zones size
     */
    this.leftZoneWidth = 0;
    this.rightZoneWidth = 0;

    this.prevX = 0;

    this.graph = new Graph(this.modules, {
      stroke: 1,
      animate: true
    });
  }

  static get CSS(){
    return {
      wrapper: 'tg-minimap',
      leftZone: 'tg-minimap__left',
      leftZoneScaler: 'tg-minimap__left-scaler',
      rightZone: 'tg-minimap__right',
      rightZoneScaler: 'tg-minimap__right-scaler',
    }
  }

  /**
   * Prepares minimap UI
   * @return {Element}
   */
  renderUi(){
    this.nodes.wrapper = Dom.make('div', Minimap.CSS.wrapper);
    this.nodes.leftZone = Dom.make('div', Minimap.CSS.leftZone);
    this.nodes.rightZone = Dom.make('div', Minimap.CSS.rightZone);
    this.nodes.leftZoneScaler = Dom.make('div', Minimap.CSS.leftZoneScaler);
    this.nodes.rightZoneScaler = Dom.make('div', Minimap.CSS.rightZoneScaler);

    this.nodes.leftZone.appendChild(this.nodes.leftZoneScaler);
    this.nodes.rightZone.appendChild(this.nodes.rightZoneScaler);

    this.nodes.wrapper.appendChild(this.nodes.leftZone);
    this.nodes.wrapper.appendChild(this.nodes.rightZone);

    this.bindEvents();

    return this.nodes.wrapper;
  }

  /**
   * Fill UI with chart and set initial Position
   */
  renderMap(){
    this.nodes.canvas = this.graph.renderCanvas({
      width: this.nodes.wrapper.offsetWidth,
      height: this.nodes.wrapper.offsetHeight
    });

    this.state.linesAvailable.forEach( name => {
      this.graph.renderLine(name);
    });

    this.setInitialPosition();

    this.nodes.wrapper.appendChild(this.nodes.canvas);
  }

  /**
   * Return width of a mini map
   * @return {number}
   */
  get wrapperWidth(){
    return this.wrapperWidthCached || this.nodes.wrapper.offsetWidth;
  }

  /**
   * Compute current minimap width
   * @return {number}
   */
  get width(){
    return this.wrapperWidth - this.leftZoneWidth - this.rightZoneWidth;
  }

  /**
   * Left zone width setter
   */
  set leftWidth(val){
    this.leftZoneWidth = val;
    this.nodes.leftZone.style.width = val + 'px';
  }

  /**
   * Right zone width setter
   */
  set rightWidth(val){
    this.rightZoneWidth = val;
    this.nodes.rightZone.style.width = val + 'px';
  }

  /**
   * Set new with to the minimap's viewport
   * @param {number} value
   */
  set width(value){
    const scrollDistance = this.modules.chart.scrollDistance;

    this.leftWidth = scrollDistance;
    this.rightWidth = this.wrapperWidth - scrollDistance - value;
    this.viewportWidth = value;
  }

  /**
   * Initial width and offset
   */
  setInitialPosition(){
    let rect = this.nodes.wrapper.getBoundingClientRect();
    this.wrapperWidthCached = rect.width;
    this.wrapperLeftCoord = rect.left;

    this.width = this.modules.chart.minimalMapWidth;

    this.viewportWidthInitial = this.viewportWidthBeforeDrag = this.width;
    this.viewportOffsetLeft = this.wrapperWidth - this.viewportWidthInitial;
    this.moveViewport(this.viewportOffsetLeft);
    this.syncScrollWithChart(this.viewportOffsetLeft);
    this.modules.chart.fitToMax();
  }

  /**
   * Current scroll value
   * @return {number}
   */
  get scrolledValue(){
    return this.leftZoneWidth;
  }

  /**
   * Value of left zone width minimum
   */
  get leftZoneMinimumWidth(){
    return 0;
  }

  /**
   * Value of left zone width maximum
   */
  get leftZoneMaximumWidth(){
    return this.wrapperWidth - this.viewportWidthInitial - this.rightZoneWidth;
  }

  /**
   * Value of right zone width minimum
   */
  get rightZoneMinimumWidth(){
    return this.viewportWidthInitial;
  }

  /**
   * Value of right zone width maximum
   */
  get rightZoneMaximumWidth(){
    return this.wrapperWidth - this.viewportWidthInitial - this.scrolledValue;
  }

  /**
   * Moves viewport from left for passed value
   * @param {string} offsetLeft
   */
  moveViewport(offsetLeft){
    const width = this.width;
    const maxLeft = this.wrapperWidth - width;
    const minLeft = this.leftZoneMinimumWidth;

    let newLeft = this.viewportOffsetLeft + offsetLeft;

    if (newLeft < minLeft){
      newLeft = minLeft;
    } else if (newLeft > maxLeft){
      newLeft = maxLeft;
    }
    this.leftWidth = newLeft;
    this.rightWidth = this.wrapperWidth - this.viewportWidthBeforeDrag - newLeft;
  }

  bindEvents(){
    this.nodes.wrapper.addEventListener('mousedown', (event) => {
      this.viewportMousedown(event);
    });

    document.body.addEventListener('mousemove', (event) => {
      this.viewportMousemove(event);
    });

    document.body.addEventListener('mouseup', (event) => {
      this.viewportMouseup(event);
    });

    this.nodes.wrapper.addEventListener('touchstart', (event) => {
      this.viewportMousedown(event);
    });

    this.nodes.wrapper.addEventListener('touchmove', (event) => {
      this.viewportMousemove(event);
    });

    this.nodes.wrapper.addEventListener('touchend', (event) => {
      this.viewportMouseup(event);
    });
  }

  /**
   * Viewport under finger
   * @param {MouseEvent|TouchEvent} event
   */
  viewportMousedown(event){
    const {target} = event;

    event.preventDefault();

    const leftScalerClicked = !!target.closest(`.${Minimap.CSS.leftZoneScaler}`);
    const rightScalerClicked = !!target.closest(`.${Minimap.CSS.rightZoneScaler}`);

    this.viewportWidthBeforeDrag = this.width;
    this.moveStartX = Event.getPageX(event);

    if (leftScalerClicked || rightScalerClicked){
      this.leftScalerClicked = leftScalerClicked;
      this.rightScalerClicked = rightScalerClicked;
      this.viewportPressed = false;
      return;
    }


    this.viewportPressed = true;
  }

  /**
   * Viewport dragged
   * @param {MouseEvent} event
   */
  viewportMousemove(event){
    if (this.viewportPressed){
      this.viewportDragged(event);
    } else if (this.leftScalerClicked){
      this.scalerDragged(event, 'left');
    } else if (this.rightScalerClicked){
      this.scalerDragged(event, 'right');
    }
  }

  viewportMouseup(){
    if (this.viewportPressed){
      this.finishSliding();
    } else if (this.leftScalerClicked){
      this.finishLeftScaling();
    } else if (this.rightScalerClicked){
      this.finishRightScaling();
    }
  }

  finishSliding(){
    this.viewportPressed = false;
    this.viewportOffsetLeft = this.scrolledValue;
  }

  finishLeftScaling(){
    this.leftScalerClicked = false;
    this.viewportOffsetLeft = this.scrolledValue;
  }

  finishRightScaling(){
    this.rightScalerClicked = false;
    this.viewportOffsetLeft = this.scrolledValue;
  }

  /**
   * @param {MouseEvent} event
   */
  viewportDragged(event){
    let delta = Event.getPageX(event) - this.moveStartX;

    this.moveViewport(delta);
    this.syncScrollWithChart();

    this.modules.chart.fitToMax(true);
  }

  /**
   * Sync scroll between minimap and chart
   * @param {number} [newScroll] - pass scroll if you have
   */
  syncScrollWithChart(newScroll = null, fromScale = false, scaling = 1){
    /**
     * How many percents of mini-map is scrolled
     */
    let scrolledValue = !isNaN(parseInt(newScroll)) ? newScroll : this.scrolledValue;
    const minimapScrolledPortion = scrolledValue / this.wrapperWidth;
    const chartScroll = minimapScrolledPortion * this.modules.chart.width;

    this.modules.chart.scroll(chartScroll * scaling, fromScale);
  }

  /**
   * Viewport side-scaler is moved
   * @param {MouseEvent|TouchEvent} event
   * @param {string} side — 'left' or 'right'
   */
  scalerDragged(event, side){
    let pageX = Event.getPageX(event);
    let delta = pageX - this.moveStartX;

    let direction = this.prevX < pageX ? 'right' : 'left';

    if (!delta || this.prevX === pageX){
      return;
    }

    this.prevX = pageX + 0;

    let newScalerWidth;

    if (side === 'left'){
      delta = delta * -1;
      newScalerWidth = this.viewportOffsetLeft - delta;

      if (newScalerWidth > this.leftZoneMaximumWidth) {
        return;
      }

      this.leftWidth = newScalerWidth;

    } else {
      newScalerWidth = this.wrapperWidth - this.viewportOffsetLeft - (this.viewportWidthBeforeDrag + delta);

      if (newScalerWidth > this.rightZoneMaximumWidth){
        return;
      }

      this.rightWidth = newScalerWidth;
    }

    const newViewportWidth = side === 'left' ?
      this.wrapperWidth - newScalerWidth - this.rightZoneWidth :
      this.wrapperWidth - this.leftZoneWidth - newScalerWidth;

    const scaling = this.viewportWidthInitial / newViewportWidth * this.modules.chart.initialScale;

    this.modules.chart.scale(scaling, direction);
    this.syncScrollWithChart(side === 'left' ? newScalerWidth : this.leftZoneWidth, true);
    this.modules.chart.fitToMax();
  }

  /**
   * Toggle path visibility
   * @param {string} name - graph name
   */
  togglePath(name){
    this.graph.togglePathVisibility(name);
    this.fitToMax();
  }

  /**
   * Upscale or downscale graph to fit visible points
   */
  fitToMax(){
    const maxVisiblePoint = Math.max(...this.state.linesAvailable.filter(line => this.graph.checkPathVisibility(line)).map(line => {
      return Math.max(...this.state.getLinePoints(line));
    }));

    this.graph.scaleToMaxPoint(maxVisiblePoint);
  }
}