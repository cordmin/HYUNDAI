/* One palette owns the canvas, materials, controls and brand ribbon. No stored derived colors. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DaitPalette = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';
  const rgb = hex => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
  const hex = values => '#' + values.map(v => Math.round(v).toString(16).padStart(2,'0')).join('');
  const mix = (a,b,t) => hex(rgb(a).map((v,i) => v*(1-t)+rgb(b)[i]*t));
  const luminance = color => rgb(color).map(v => (v/=255) <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  function polar(color) {
    const [r,g,b]=rgb(color).map(v=>v/255), max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
    const h=!d ? 0 : (max===r ? ((g-b)/d+6)%6 : max===g ? (b-r)/d+2 : (r-g)/d+4)*60;
    return { h, weight:d };
  }
  function hsl(h,s,l) {
    const a=s*Math.min(l,1-l), f=n=>{const k=(n+h/30)%12;return (l-a*Math.max(-1,Math.min(k-3,9-k,1)))*255};
    return hex([f(0),f(8),f(4)]);
  }
  function derive(colors, mode) {
    const a=polar(colors.start), b=polar(colors.end), explicit=/^#[0-9a-f]{6}$/i.test(colors.accent||'') ? polar(colors.accent) : null;
    let x=0,y=0;
    for(const c of [a,b]){x+=Math.cos(c.h*Math.PI/180)*c.weight;y+=Math.sin(c.h*Math.PI/180)*c.weight}
    const neutral=!explicit && Math.max(a.weight,b.weight)<.045;
    const hue=explicit ? explicit.h : Math.hypot(x,y)<.02 ? (a.weight>=b.weight?a.h:b.h) : (Math.atan2(y,x)*180/Math.PI+360)%360;
    const saturation=neutral ? 0 : Math.min(.58,Math.max(.26,Math.max(a.weight,b.weight,explicit?.weight||0)*.85));
    const tint=(l,s=saturation)=>hsl(hue,s,l), dark=mode==='dark';
    const darkInk=explicit?'#18212a':tint(.10,.18*(neutral?0:1)), lightInk=explicit?'#f8faff':tint(.985,.20*(neutral?0:1));
    const paper=explicit?(dark?'#11151a':'#f7f9fc'):tint(dark?.14:.965,.16*(neutral?0:1)), card=explicit?(dark?'#1b2027':'#ffffff'):tint(dark?.19:.985,.16*(neutral?0:1));
    const soft=tint(dark?.25:.90,.22*(neutral?0:1));
    let accent=explicit?(dark?mix(colors.accent,'#ffffff',.4):colors.accent):tint(dark?.79:.32), hover=explicit?mix(accent,dark?'#ffffff':'#000000',.1):tint(dark?.84:.27);
    // The original default is still Pearl; custom hues take over all roles below.
    const defaultRose = (colors.start.toLowerCase()==='#f8e9eb'&&colors.end.toLowerCase()==='#ecd9df') || (colors.start.toLowerCase()==='#30212a'&&colors.end.toLowerCase()==='#452e38');
    if(defaultRose){accent=dark?'#f0b9cc':'#884d62';hover=dark?'#f7cedc':'#733c51'}
    // Yellow/lime can fall between two tinted inks. Lower action lightness, preserving hue.
    let actionLightness=.32;
    while(Math.max(contrast(accent,darkInk),contrast(accent,lightInk))<4.5 && actionLightness>.12) {
      actionLightness-=.015; accent=tint(actionLightness); hover=tint(actionLightness-.05);
    }
    const onAccent=contrast(accent,darkInk)>contrast(accent,lightInk)?darkInk:lightInk;
    // Pastel fills need a separate, readable ink in the same hue family.
    const subjectInk=contrast(accent,soft)>=4.5?accent:tint(dark?.84:.27);
    const alpha=(color,n)=>color+Math.round(n*255).toString(16).padStart(2,'0');
    const logo = bright => bright ? [tint(.25),tint(.38),tint(.29)] : [tint(.83),tint(.95,.18),tint(.76)];
    const brand = logo(luminance(mix(colors.start,colors.end,.5))>=.32);
    const tokens={
      '--paper':paper,'--card':card,'--soft':soft,'--line':tint(dark?.39:.79,.16*(neutral?0:1)),
      '--ink':dark?lightInk:darkInk,'--muted':explicit?(dark?'#bdc8d4':'#53616e'):tint(dark?.77:.34,.13*(neutral?0:1)),
      '--lilac':accent,'--lilac-hover':hover,'--on-lilac':onAccent,
      '--subject-ink':subjectInk,'--pattern-ink':tint(dark?.80:.30),
      '--control-ink':subjectInk,'--control-track':mix(subjectInk,soft,.74),
      '--glass':alpha(paper,dark?.56:.46),'--glass-raised':alpha(card,.68),
      '--glass-menu':alpha(paper,.94),'--glass-hover':alpha(card,.84),
      '--glass-edge':alpha(lightInk,dark?.25:.76),'--glass-sheen':alpha(lightInk,dark?.22:.82),
      '--glass-shadow':`inset 0 1px 0 var(--glass-sheen), 0 8px 24px ${alpha(darkInk,dark?.26:.09)}`,
      '--bg-glow':alpha(mix(colors.start,colors.end,.5),defaultRose?.15:.04),
      '--wave-top':mix(accent,lightInk,.36),'--wave-bottom':accent,
      '--logo-start':brand[0],'--logo-mid':brand[1],'--logo-end':brand[2],
      '--shadow-rgb':rgb(darkInk).join(', '),'--selection':soft,
      '--notice-bg':darkInk,'--notice-ink':lightInk,'--player-shade':alpha(darkInk,.20)
    };
    return { hue, neutral, darkInk, lightInk, accent, tokens, logo };
  }
  // The selected accent also owns the gradient, not just the controls.
  function background(accent,mode) {
    return {start:mode==='dark'?'#090b0e':'#ffffff',end:mode==='dark'?mix(accent,'#090b0e',.65):accent,accent};
  }
  return { derive, contrast, background };
});
