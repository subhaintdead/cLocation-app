// If tiles stay blank, swap TILES for: https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

// Blue dot = the vehicle. Green dot = you (only after "Show my location" is on). Dashed line joins them.
// Functions called from React Native via injectJavaScript: update, setMe, clearMe, fitBoth, centerVehicle.
export const MAP_HTML = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"/>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<style>html,body,#m{height:100%;margin:0;background:#0b1220}</style></head>
<body><div id="m"></div><script>
var map=L.map('m').setView([26.4,88.8],6);
L.tileLayer('${TILES}',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
var mk=null,line=null,fitted=false;
var meMk=null,meAcc=null,link=null,meFitted=false;
function drawLink(){
  if(link){map.removeLayer(link);link=null;}
  if(mk&&meMk)link=L.polyline([mk.getLatLng(),meMk.getLatLng()],{color:'#f1f5f9',weight:2,dashArray:'6 8',opacity:.85}).addTo(map);
}
function fitBoth(){
  if(mk&&meMk)map.fitBounds(L.latLngBounds([mk.getLatLng(),meMk.getLatLng()]),{padding:[60,60],maxZoom:17});
}
function centerVehicle(){
  if(mk)map.setView(mk.getLatLng(),Math.max(map.getZoom(),16));
}
function update(d){
  if(d.lat==null)return;
  var p=[d.lat,d.lng];
  if(!mk){mk=L.circleMarker(p,{radius:10,color:'#fff',weight:3,fillColor:'#2563eb',fillOpacity:1}).addTo(map);}
  else mk.setLatLng(p);
  if(line){map.removeLayer(line);line=null;}
  if(d.trail&&d.trail.length>1)line=L.polyline(d.trail,{color:'#2563eb',weight:4,opacity:.5}).addTo(map);
  drawLink();
  if(meMk){ if(!meFitted){fitBoth();meFitted=true;} }
  else if(!fitted){map.setView(p,16);fitted=true;}
  else if(!map.getBounds().contains(p))map.panTo(p);
}
function setMe(m){
  var p=[m.lat,m.lng];
  if(!meMk){
    meAcc=L.circle(p,{radius:m.acc||0,color:'#16a34a',weight:1,fillColor:'#16a34a',fillOpacity:.1}).addTo(map);
    meMk=L.circleMarker(p,{radius:8,color:'#fff',weight:3,fillColor:'#16a34a',fillOpacity:1}).addTo(map);
  }else{meMk.setLatLng(p);meAcc.setLatLng(p);meAcc.setRadius(m.acc||0);}
  drawLink();
  if(!meFitted&&mk){fitBoth();meFitted=true;}
  else if(!mk&&!meFitted){map.setView(p,16);}
}
function clearMe(){
  [meMk,meAcc,link].forEach(function(x){if(x)map.removeLayer(x);});
  meMk=meAcc=link=null;meFitted=false;
}
</script></body></html>`;
