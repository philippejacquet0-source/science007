import {addGridPoint,nearestGridPoint} from './catalogue.mjs';

// One canvas and one screen-space index, rather than one Leaflet layer per station.
export function createStationLayer({label,onSelect,style=()=>({color:'rgba(35,138,137,.74)'})}){
 const CanvasStations=L.Layer.extend({
  initialize(){this.stations=[];this.grid=new Map();this.sprites=new Map();},
  onAdd(map){
   this.map=map;
   this.canvas=L.DomUtil.create('canvas','leaflet-station-canvas',map.getPane('stations'));
   this.canvas.setAttribute('aria-hidden','true');
   this.tooltip=L.tooltip({direction:'top',offset:[0,-7]});
   map.on('moveend zoomend resize viewreset',this.draw,this);
   map.on('zoomstart',this.hide,this);
   map.on('mousemove',this.hover,this);
   map.on('click',this.click,this);
   map.getContainer().addEventListener('mouseleave',this.leave=()=>this.clearHover());
   this.draw();
  },
  onRemove(map){
   map.off('moveend zoomend resize viewreset',this.draw,this);
   map.off('zoomstart',this.hide,this);map.off('mousemove',this.hover,this);map.off('click',this.click,this);
   map.getContainer().removeEventListener('mouseleave',this.leave);
   this.clearHover();this.canvas.remove();this.map=null;
  },
  setStations(stations){this.stations=stations;this.draw();return this;},
  hide(){this.canvas.style.visibility='hidden';this.clearHover();},
  draw(){
   if(!this.map)return;
   const start=performance.now(),map=this.map,size=map.getSize(),origin=map.getPixelOrigin(),offset=map.containerPointToLayerPoint([0,0]);
   const scale=256*Math.pow(2,map.getZoom()),ratio=Math.min(window.devicePixelRatio||1,2),radius=map.getZoom()<8?2.5:3.5;
   const canvas=this.canvas;
   L.DomUtil.setPosition(canvas,offset);
   canvas.style.width=size.x+'px';canvas.style.height=size.y+'px';
   canvas.width=Math.ceil(size.x*ratio);canvas.height=Math.ceil(size.y*ratio);
   const context=canvas.getContext('2d');context.setTransform(ratio,0,0,ratio,0,0);
   this.grid=new Map();let visible=0;
   for(const station of this.stations){
    const appearance=style(station),r=appearance.selected?6:radius;
    const x=station._mercatorX*scale-origin.x-offset.x,y=station._mercatorY*scale-origin.y-offset.y;
    if(x < -r||y < -r||x>size.x+r||y>size.y+r)continue;
    const color=appearance.color||'#72928d',key=`${ratio}:${r}:${color}:${!!appearance.selected}`;
    let sprite=this.sprites.get(key);const diameter=r*2+4;
    if(!sprite){sprite=document.createElement('canvas');sprite.width=Math.ceil(diameter*ratio);sprite.height=Math.ceil(diameter*ratio);const paint=sprite.getContext('2d');paint.scale(ratio,ratio);paint.beginPath();paint.arc(diameter/2,diameter/2,r,0,Math.PI*2);paint.fillStyle=color;paint.fill();paint.strokeStyle=appearance.selected?'#173f4b':'#fff';paint.lineWidth=appearance.selected?1.8:.5;paint.stroke();this.sprites.set(key,sprite);if(this.sprites.size>1500)this.sprites.clear();}
    context.drawImage(sprite,x-diameter/2,y-diameter/2,diameter,diameter);
    addGridPoint(this.grid,{x,y,station,selected:!!appearance.selected});visible++;
   }
   canvas.style.visibility='visible';
   map.getContainer().dataset.drawMs=(performance.now()-start).toFixed(1);
   map.getContainer().dataset.visibleStations=String(visible);
   map.getContainer().dataset.zoom=String(map.getZoom());
  },
  click(event){
   if(this.suppressClick||this.dragging)return;
   const point=nearestGridPoint(this.grid,event.containerPoint.x,event.containerPoint.y);
   if(point)onSelect(point.station.code_station,!!event.originalEvent?.shiftKey);
  },
  hover(event){
   if(this.dragging)return;
   const point=nearestGridPoint(this.grid,event.containerPoint.x,event.containerPoint.y);
   if(!point){this.clearHover();return;}
   this.map.getContainer().style.cursor='pointer';
   if(this.hovered===point.station.code_station)return;
   this.hovered=point.station.code_station;
   const content=document.createElement('span');content.textContent=label(point.station);
   this.tooltip.setContent(content).setLatLng([point.station.latitude,point.station.longitude]).addTo(this.map);
  },
  clearHover(){this.hovered=null;if(this.map)this.map.getContainer().style.cursor='';this.tooltip?.remove();}
 });
 return new CanvasStations();
}

export function installRectangleSelection(map,layer,{onBounds,isActive,onComplete}){
 const container=map.getContainer();let drag=null;
 map.boxZoom.disable();
 const cleanup=()=>{if(!drag)return;drag.box.remove();if(drag.draggable)map.dragging.enable();layer.dragging=false;container.releasePointerCapture?.(drag.id);drag=null;};
 container.addEventListener('pointerdown',event=>{
  if(event.button!==0||(!event.shiftKey&&!isActive())||event.target.closest('.leaflet-control'))return;
  const rect=container.getBoundingClientRect(),start=[event.clientX-rect.left,event.clientY-rect.top];
  drag={id:event.pointerId,start,end:start,draggable:map.dragging.enabled(),box:document.createElement('div')};
  drag.box.className='selection-rectangle';container.append(drag.box);map.dragging.disable();layer.dragging=true;layer.clearHover();container.setPointerCapture(event.pointerId);event.preventDefault();event.stopImmediatePropagation();
 },true);
 container.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.id)return;const rect=container.getBoundingClientRect();drag.end=[Math.max(0,Math.min(rect.width,event.clientX-rect.left)),Math.max(0,Math.min(rect.height,event.clientY-rect.top))];
  const [a,b]=[drag.start,drag.end];Object.assign(drag.box.style,{left:Math.min(a[0],b[0])+'px',top:Math.min(a[1],b[1])+'px',width:Math.abs(a[0]-b[0])+'px',height:Math.abs(a[1]-b[1])+'px'});event.preventDefault();event.stopImmediatePropagation();
 },true);
 container.addEventListener('pointerup',event=>{
  if(!drag||event.pointerId!==drag.id)return;const {start,end}=drag;
  layer.suppressClick=true;setTimeout(()=>layer.suppressClick=false,100);
  const wide=Math.abs(start[0]-end[0])>=8&&Math.abs(start[1]-end[1])>=8;
  const bounds=wide?L.latLngBounds(map.containerPointToLatLng(start),map.containerPointToLatLng(end)):null;
  cleanup();if(bounds)onBounds(bounds);else{const point=nearestGridPoint(layer.grid,end[0],end[1]);if(point)onSelectPoint(point.station.code_station);}
  onComplete();event.preventDefault();event.stopImmediatePropagation();
 },true);
 function onSelectPoint(code){onBounds(null,code);}
 container.addEventListener('pointercancel',cleanup,true);
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){cleanup();onComplete();}});
}
