const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { execFileSync } = require('node:child_process');
const campaign = require('../src/templatesCampaign');
const { buildHtml, TEMPLATE_REQUIREMENTS } = require('../src/imageRenderer');
const { chooseTemplate, templateCandidates } = require('../scripts/generate-daily');
const art = require('../src/artDirection');

test('la identidad siempre es neutra con naranja, incluidas las recetas pastel anteriores', () => {
  for(const name of [...Object.keys(campaign.PALETTES),'salvia','cielo','arena','arcilla']) {
    const p=campaign.paletteFor(name);
    assert.equal(p.ink,require('../src/config').brand.colors.black);assert.equal(p.accent,require('../src/config').brand.colors.darkOrange);
    const rgb=p.paper.slice(1).match(/../g);
    assert.equal(new Set(rgb).size,1);
  }
  for(const template of campaign.NAMES) {
    const plan=campaign.scenePlan(template);
    const a=plan.copy,b=plan.subject;
    assert.ok(a[0]+a[2]<=b[0] || b[0]+b[2]<=a[0] || a[1]+a[3]<=b[1] || b[1]+b[3]<=a[1]);
    const brief=campaign.sceneDirection({template,format:'feed'});
    assert.match(brief,/fotografía será el fondo de TODO el aviso/);
    assert.match(brief,/PROHIBIDO poner personas.*cajas, cubos, pedestales/);
    assert.doesNotMatch(brief,/por fuera de esta foto|no reserves tercios/);
  }
});

test('los avisos tienen 18 composiciones distintas sin superponer texto y producto', () => {
  assert.equal(campaign.NAMES.length, 18);
  assert.equal(new Set(Object.values(campaign.LAYOUTS).map(l => JSON.stringify([l.text,l.photos]))).size,18);
  const intersects = (a,b) => a[0]<b[0]+b[2]-.001 && a[0]+a[2]>b[0]+.001 && a[1]<b[1]+b[3]-.001 && a[1]+a[3]>b[1]+.001;
  for(const [name,layout] of Object.entries(campaign.LAYOUTS)) {
    assert.equal(TEMPLATE_REQUIREMENTS[name].minImages,layout.photos.length);
    const boxes=[layout.text,...layout.photos,[0,.905,1,.095]];
    for(let i=0;i<boxes.length;i++) {
      const [x,y,w,h]=boxes[i];
      assert.ok(x>=0 && y>=0 && x+w<=1.001 && y+h<=1.001,name);
      for(let j=i+1;j<boxes.length;j++) assert.equal(intersects(boxes[i],boxes[j]),false,name);
    }
  }
});

test('el director y el fallback respetan material y rotación, incluso si la IA repite', () => {
  const slot={id:7,pillar:'producto',post_type:'post',format:'feed'};
  const visualProduct={images:['https://example.com/one.jpg','https://example.com/one.jpg'],description:'Algodón'};
  const candidates=templateCandidates(slot,{visualProduct});
  assert.ok(candidates.includes('aviso_derecha'));
  assert.ok(!candidates.includes('aviso_duo'));
  assert.notEqual(chooseTemplate(slot,{visualProduct,aiPick:'aviso_portada',recientes:[{template:'aviso_portada'}]}),'aviso_portada');
  assert.equal(chooseTemplate(slot,{override:'aviso_portada',visualProduct,recientes:[{template:'aviso_portada'}]}),'aviso_portada');
  assert.notEqual(art.pickVariant('aviso_derecha',[{template:'aviso_portada',variant:'blanco'}]),'blanco');
  assert.equal(campaign.resolveLayout('aviso_mosaico',1),campaign.LAYOUTS.aviso_portada);
});

test('precio final y descuento forman un solo bloque; nunca se inventa una promoción', () => {
  assert.equal(campaign.commercialText({price:null,promoPrice:null}),'');
  assert.doesNotMatch(campaign.commercialText({price:50000,promoPrice:60000}),/OFF|<s>/);
  assert.match(campaign.commercialText({price:50000,promoPrice:40000}),/20% OFF.*<s>\$50\.000<\/s>.*\$40\.000/);
  assert.doesNotMatch(campaign.commercialText({price:50000}),/OFF|<s>/);
});

test('modo foto y corrección no generan ni pagan una escena; modo IA recibe dirección clara', () => {
  // Proceso aislado: dobles sólo para proveedores externos y navegador. Se ejecuta
  // renderPostBuffer real, sin subir archivos ni consumir créditos de imagen.
  execFileSync(process.execPath,['-e',`
    const assert=require('node:assert/strict');
    const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"/>');
    let calls=0,uploads=0,html='';
    require('./src/ai').generateProductScene=async args=>{
      calls++;assert.equal(args.artStyle,'light_campaign');assert.match(args.brief,/CAMPAÑA BLACKS/);
      return {buffer:svg,mimeType:'image/svg+xml',costUsd:.04};
    };
    require('./src/storage').uploadAsset=async()=>{uploads++;return 'https://example.com/render.jpg';};
    require('puppeteer').launch=async()=>({connected:true,on(){},newPage:async()=>({
      setViewport:async()=>{},setContent:async value=>{html=value;},evaluate:async()=>[],
      screenshot:async()=>svg,close:async()=>{}
    })});
    const {renderPostBuffer}=require('./src/imageRenderer');
    (async()=>{
      const base={template:'aviso_portada',overlayTitle:'Pantalón cargo',productImageUrl:'https://example.com/catalogo.jpg'};
      const photo=await renderPostBuffer({...base,useAiProductScene:false});
      assert.equal(calls,0);assert.equal(photo.costUsd,0);assert.match(html,/catalogo.jpg/);
      const ai=await renderPostBuffer({...base,useAiProductScene:true,artStyle:'poster'});
      assert.equal(calls,1);assert.equal(ai.costUsd,.04);assert.equal(ai.campaignSceneVersion,2);assert.ok(ai.cleanImageUrl.startsWith('data:image/'));
      const correction=await renderPostBuffer({...base,productImageUrl:null,bgImageUrl:ai.cleanImageUrl,campaignSceneVersion:ai.campaignSceneVersion,useAiProductScene:false});
      assert.equal(calls,1);assert.equal(correction.cleanImageUrl,ai.cleanImageUrl);assert.equal(correction.costUsd,0);
      assert.equal(uploads,3);
    })().catch(e=>{console.error(e);process.exitCode=1;});
  `],{cwd:require('node:path').resolve(__dirname,'..'),timeout:15000,stdio:'pipe'});
});

const fixture = (i,wide=false) => 'data:image/svg+xml;base64,'+Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${wide?1200:600}" height="900"><rect width="100%" height="100%" fill="#f0eeee"/><rect x="20" y="20" width="${wide?1160:560}" height="860" fill="none" stroke="#b44925" stroke-width="10"/><text x="60" y="100" font-size="50">Foto ${i}</text></svg>`).toString('base64');
let browser;
after(async()=>{if(browser)await browser.close();});
test('render feed/story: imagen entera, escena reutilizada, textos y oferta dentro de sus zonas', async () => {
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox'],...(process.env.PUPPETEER_EXECUTABLE_PATH?{executablePath:process.env.PUPPETEER_EXECUTABLE_PATH}:{})});
  const page=await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request',r=>r.url().startsWith('http')?r.abort():r.continue());
  for(const mode of ['foto','escena']) for(const format of ['feed','story']) for(const template of campaign.NAMES) {
    const h=format==='story'?1920:1350;
    await page.setViewport({width:1080,height:h});
    await page.setContent(buildHtml({template,format,variant:'cielo',overlayTitle:'Pantalón cargo ripstop antidesgarro',kicker:'Reposición de producto',specs:['Tejido ripstop','Bolsillos laterales'],...(mode==='escena'?{bgImageUrl:fixture(0),campaignSceneVersion:2}:{productImageUrl:fixture(0)}),productImageUrls:[fixture(1),fixture(2,true),fixture(3)],price:72399,promoPrice:59999,ctaLabel:'Hasta 6 cuotas sin interés'}),{waitUntil:'load'});
    await campaign.fitText(page);
    const state=await page.evaluate(()=>({
      images:[...document.images].map(el=>({loaded:el.complete&&el.naturalWidth>0,fit:getComputedStyle(el).objectFit,transform:getComputedStyle(el).transform})),
      overflow:[...document.querySelectorAll('.copy,.footer,h1')].filter(el=>(el.tagName!=='H1'&&el.scrollHeight>el.clientHeight+1)||el.scrollWidth>el.clientWidth+1).map(el=>el.className||el.tagName),
      main:document.images[0].src,
      scene:document.querySelector('.scene-photo')?.getBoundingClientRect().toJSON(),
      text:[...document.querySelectorAll('.copy,.footer')].map(el=>({top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom})),
    }));
    assert.deepEqual(state.overflow,[],`${format}/${template}`);
    assert.equal(state.main,fixture(0));
    if(mode==='escena') assert.deepEqual([state.scene.x,state.scene.y,state.scene.width,state.scene.height],[0,0,1080,h]);
    assert.equal(state.images.length,campaign.LAYOUTS[template].photos.length);
    assert.ok(state.images.every(i=>i.loaded&&i.fit==='contain'&&i.transform==='none'),template);
    assert.ok(state.text.every(r=>r.top>=(format==='story'?196:54)&&r.bottom<=h-(format==='story'?236:54)+1),template);
  }
  // Un sujeto angosto deja espacio lateral real: la foto crece sin recortes.
  const studio=width=>'data:image/svg+xml;base64,'+Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#eee"/><rect x="${(600-width)/2}" y="20" width="${width}" height="860" fill="#123"/></svg>`).toString('base64');
  for(const [width,expected] of [[160,true],[560,false]]) {
    await page.setContent(buildHtml({template:'aviso_derecha',format:'feed',overlayTitle:'Pantalón cargo',productImageUrl:studio(width)}),{waitUntil:'load'});
    await campaign.fitText(page);
    assert.equal(await page.$eval('.canvas',el=>el.dataset.expanded==='true'),expected);
    assert.equal(await page.$eval('.photo img',el=>getComputedStyle(el).objectFit),'contain');
  }
  await page.setContent(buildHtml({template:'aviso_derecha',format:'feed',campaignSceneVersion:2,overlayTitle:'Cargo ripstop antidesgarro',bgImageUrl:studio(160)}),{waitUntil:'load'});
  await campaign.fitText(page);
  const adapted=await page.$eval('.copy',el=>({width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right,overflow:el.scrollWidth>el.clientWidth+1}));
  assert.ok(adapted.width<384 && adapted.width>=220);
  assert.ok(adapted.right<420); // El sujeto empieza en x=420; la tipografía queda fuera.
  assert.equal(adapted.overflow,false);
  await page.close();
});
