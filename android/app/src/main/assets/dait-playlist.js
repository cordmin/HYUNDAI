/* Queue and series data are independent of the screen and the car bridge. */
(function(root){
  'use strict';
  class Playlist {
    constructor(lessons, saved={}, catalog=[]) {
      this.ids=new Set(lessons.map(item=>item.id));
      this.autoNext=saved?.autoNext !== false;
      this.followSeries=saved?.followSeries !== false;
      this.cues=saved?.cues !== false;
      this.sequence=0;
      this.items=(Array.isArray(saved?.items)?saved.items:[]).filter(item=>item&&this.ids.has(item.lesson)).slice(0,100).map(item=>({key:++this.sequence,lesson:item.lesson,...(item.fromStop===true?{fromStop:true}:{})}));
      this.series=[...catalog.map(item=>({...item,builtIn:true})),...(Array.isArray(saved?.series)?saved.series:[])].flatMap((item,i)=>{
        if(!item||typeof item!=='object')return [];
        const ids=[...new Set(Array.isArray(item.lessons)?item.lessons:[])].filter(id=>this.ids.has(id));
        return ids.length>1&&typeof item.title==='string'&&item.title.trim()?[{id:/^[a-z0-9_-]{1,64}$/.test(item.id||'')?item.id:'series-'+i,builtIn:item.builtIn===true,title:item.title.trim().slice(0,60),lessons:ids,outros:this.normalizeOutros(item.outros,ids)}]:[];
      });
    }
    snapshot(){return {autoNext:this.autoNext,followSeries:this.followSeries,cues:this.cues,items:this.items.map(item=>({...item})),series:this.series.filter(item=>!item.builtIn).map(item=>({...item,lessons:[...item.lessons],outros:{...item.outros}}))}}
    add(lesson, position='last', fromStop=false){
      if(!this.ids.has(lesson)||this.items.length>=100||!['next','last'].includes(position))return false;
      const item={key:++this.sequence,lesson,...(fromStop?{fromStop:true}:{})};
      if(position==='next')this.items.unshift(item);else this.items.push(item);
      return true;
    }
    remove(key){this.items=this.items.filter(item=>item.key!==key)}
    promote(key){const index=this.items.findIndex(item=>item.key===key);if(index<0)return false;const [item]=this.items.splice(index,1);this.items.unshift(item);return true}
    move(key, delta){if(![-1,1].includes(delta))return false;const i=this.items.findIndex(item=>item.key===key),j=i+delta;if(i<0||j<0||j>=this.items.length)return false;[this.items[i],this.items[j]]=[this.items[j],this.items[i]];return true}
    seriesFor(lesson){return this.series.find(item=>item.lessons.includes(lesson))||null}
    prior(lesson, records=[]){const series=this.seriesFor(lesson);if(!series)return null;const index=series.lessons.indexOf(lesson);if(index<1)return null;const id=series.lessons[index-1];return records.some(item=>item.lesson===id&&item.finished)?null:id}
    following(lesson){const series=this.seriesFor(lesson);return this.followSeries&&series?series.lessons[series.lessons.indexOf(lesson)+1]||null:null}
    next(lesson){const item=this.items[0];return item?{...item,source:'queue'}:this.following(lesson)?{lesson:this.following(lesson),source:'series'}:null}
    order(first, skipKey){const queued=this.items.filter(item=>item.key!==skipKey).map(item=>item.lesson);const series=this.followSeries?(this.seriesFor(first)?.lessons.slice(this.seriesFor(first).lessons.indexOf(first)+1)||[]):[];return [first,...queued,...series.filter(id=>!queued.includes(id))]}
    normalizeOutros(value,ids){const result={};for(const id of ids){const cue=value?.[id];if(cue&&/^lesson\/[a-z0-9_-]+$/.test(cue.clip)&&Number.isFinite(cue.seconds)&&cue.seconds>0&&cue.seconds<=30)result[id]={clip:cue.clip,seconds:cue.seconds,text:String(cue.text||'다음 수업으로 이어져요').slice(0,100)};}return result}
    saveSeries(title, lessons, options={}){const ids=[...new Set(lessons)].filter(id=>this.ids.has(id));if(typeof title!=='string'||!title.trim()||ids.length<2)return null;const item={id:'series-'+(this.series.length+this.sequence++),title:title.trim().slice(0,60),lessons:ids,outros:this.normalizeOutros(options.outros,ids)};this.series.push(item);return item}
  }
  const api={Playlist};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DaitPlaylist=api;
})(typeof globalThis!=='undefined'?globalThis:this);
