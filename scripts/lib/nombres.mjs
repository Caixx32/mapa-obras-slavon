// Privacidad de los nombres. Decide qué obras pueden mostrar el nombre y limpia el nombre que se muestra.
//   propuesta = 'nombrable'  → se muestra el nombre (club, complejo comercial, colegio, country/barrio, municipio, sindicato, estadio, empresa)
//             = 'anonima'    → NO se muestra (persona física, sin nombre, solo una dirección)
//             = 'revisar'    → ambiguo: por seguridad se publica como anónima hasta que lo revises
// Una persona física NUNCA es nombrable, aunque el nombre diga «Club» o «Cancha de».
import { norm } from './util.mjs';

const lista = (s) => new Set(s.trim().split(/\s+/));

// Nombres de pila frecuentes (sin tildes). Sirven para detectar «Sandra Tosoni», «Emilio Luti», «Cancha de Leonardo Fernández»…
const NOMBRES_PILA = lista(`
  adrian agustin alan alberto alejandro alejo alexis alfredo alicia alvaro ana andrea andres angel angela antonio ariel arnaldo arturo augusto
  ausberto aldo amalia armando benjamin bernardo bruno camila carla carlos carolina cecilia cesar claudia claudio cristian cristina daniel
  daniela dario david diego dolores eduardo elena eliana elias emanuel emiliano emilio enrique erica ernesto esteban eugenia fabian fabiana
  facundo federico felipe fernando flavia francisco gabriel gabriela gaston gerardo german gisela gonzalo graciela gustavo guido guillermo
  hector hernan horacio hugo ignacio ivan javier jeronimo joaquin jorge jose juan julian julio karina laura laureano leandro leonardo lorena
  lucas lucia luciano luis luisa mabel manuel marcela marcelo marcos mariano mariana maria mario marta martin matias mauricio maximiliano
  maico maxi miguel mirta monica nahuel natalia nelson nestor nicolas noelia norberto omar oscar pablo pamela patricia paula pedro rafael
  ramiro ramon raul ricardo roberto rodolfo rodrigo rolando romina rosana ruben sandra santiago santos sebastian sergio silvia simon sofia
  sonia susana tadeo tomas valentin valeria vanesa veronica vicente victor viviana walter yamila yonatan yesica zulema
  nicanor wilfredo ezequiel gaspar lautaro thiago bautista franco gino ismael ivo jonatan kevin leo lisandro lorenzo matheo maximo mateo
  nelida norma olga rita rosa roxana sabrina silvana soledad stella tamara teresa ulises ximena yanina
  ale nico fede gabi vero cris guille santi facu melisa gladys esther abel ada adela agostina alba amelia anibal antonella araceli belen
  beatriz bianca candela celeste celia clara cristobal delfina diana dora edgardo elsa emma eva evelyn fanny felix fermin flora gisele
  griselda haydee hilda ines irene isabel iris jesica joel jonathan josefina juana judith lara leticia lidia liliana lilian lola lucrecia
  magdalena malena marcia margarita mariela marina martha matilde melina micaela milagros miriam nadia nancy nilda nora octavio ofelia
  orlando paola paulina rebeca regina renata rosalia ruth samuel sara selena silvio tatiana tobias valentina vilma virginia wanda yolanda
`);
const STOP = lista('de del la las el lo los y e en al a con para por the of');
const SANTO = lista('san santa santo');

// Palabras que muestran QUE es una institución/empresa (no una persona)
const INSTITUCION = lista(`
  club colegio escuela instituto universidad municipalidad municipio country barrio sindicato estadio polideportivo cooperativa asociacion
  sociedad fundacion mutual circulo centro camping parque plaza anfiteatro union gimnasia esgrima tiro tecnopolis predio campo villa
  ferroviaria deportivo deportiva atletico nautico agrario sportivo sportsman social recreativo recreo gremio uom
  boca river racing independiente huracan velez lanus banfield quilmes tigre estudiantes belgrano talleres newells central chicago argentinos
  juniors platense defensa justicia colon atlanta ferro almagro temperley sarmiento rivadavia italiano espanol asturiano gallego
`);
const INSTITUCION_FUERTE = lista('colegio escuela instituto universidad municipalidad municipio country barrio sindicato gremio uom estadio polideportivo cooperativa fundacion mutual circulo anfiteatro tecnopolis sociedad asociacion fomento');
const DEPORTE = lista(`
  padel paddel padle futbol football fut f5 f7 f11 hockey tenis basquet voley rugby sport sports cancha canchas complejo center arena gol golazo
  gool fc cesped sintetico fitness gym gim training domo stadium eventos multieventos cabanas school day indoor techado techada pelota deportes
  gimnasio
`);
const GENERICAS = new Set([...STOP, ...INSTITUCION, ...DEPORTE]);
// Palabras que NO identifican a ningún club por sí solas («Complejo Deportivo», «Fútbol 5», «Municipio»). Sin nombres de clubes famosos (Lanús, Boca…).
const VACIAS = new Set([...STOP, ...lista('padel paddel padle futbol football fut f5 f7 f11 hockey tenis basquet voley rugby cancha canchas complejo cesped sintetico techado techada pelota deportes gimnasio fc club colegio escuela instituto universidad municipalidad municipio country barrio sindicato estadio polideportivo cooperativa asociacion sociedad fundacion mutual circulo centro camping parque plaza anfiteatro deportivo deportiva atletico social recreativo recreo gremio campo predio villa')]);
const DEPORTE_BASE = lista('futbol football fut padel paddel hockey');
// Empresas que compraron la cancha pero no son un complejo deportivo: siempre anónimas.
const EMPRESA = lista('srl sa sas sac construcciones constructora energy inmobiliaria refineria');
// Nombres que el dueño pidió dejar anónimos (comparados sin tildes ni mayúsculas).
const ANONIMAS_EXACTAS = new Set(['bolivar padel completa', 'palacios construcciones', 'pose sa tecma sa viviendas u t', 'tecnosolutions srl', 'quintana energy', 'municipio', 'futbol 5', 'complejo deportivo']);
// Palabras con las que empieza el nombre de una institución: «Pablo Club Atlético…», «Eugenia Municipalidad de…»
const INSTITUCION_INICIO = lista('club municipalidad municipio instituto barrio colegio escuela country sindicato estadio polideportivo cooperativa fundacion mutual circulo centro camping parque plaza sociedad asociacion universidad');
const ACENTOS = { atletico: 'atlético', nautico: 'náutico', padel: 'pádel', futbol: 'fútbol', cesped: 'césped', alegria: 'alegría', union: 'unión', asociacion: 'asociación', fundacion: 'fundación', bolivar: 'bolívar', jose: 'josé', maria: 'maría', martin: 'martín', cordoba: 'córdoba', tucuman: 'tucumán', parana: 'paraná', republica: 'república', lopez: 'lópez', gonzalez: 'gonzález', rodriguez: 'rodríguez', fernandez: 'fernández', perez: 'pérez', ramirez: 'ramírez', sintetico: 'sintético', cabanas: 'cabañas', tecnopolis: 'tecnópolis', circulo: 'círculo' };

const PALABRAS_CALLE = /\b(calle|av|avda|avenida|ruta|bv|boulevard|pasaje|pje|diagonal|camino)\b\.?/i;
const CARGOS = 'presidente|presidenta|director|directora|encargado|encargada|due[ñn]o|due[ñn]a|propietario|propietaria|secretario|secretaria|tesorero|tesorera|gerente|administrador|administradora';

// Lugares que llevan nombre de persona: no son personas («Vicente López», «9 de Julio»).
const LUGARES_CON_NOMBRE = /\b(vicente lopez|jose c paz|marcos paz|esteban echeverria|florencio varela|pedro luro|carlos casares|bernardo de irigoyen|juan b justo|jesus maria|tomas jofre|general [a-z]+|almirante brown|\d+ de [a-z]+)\b/g;
const toks = (s) => norm(s).replace(LUGARES_CON_NOMBRE, ' ').replace(/\bf c\b/g, 'fc').split(' ').filter(Boolean);
const tokensLugar = (o) => new Set([...toks(o.ciudad), ...toks(o.provincia)]);   // «Vicente López», «Jesús María»: son lugares, no personas
const esDesconocida = (t) => /^[a-z]{3,}$/.test(t) && !GENERICAS.has(t) && !NOMBRES_PILA.has(t) && !SANTO.has(t);
const esGeneral = (t) => GENERICAS.has(t) || STOP.has(t);

// ---------------------------------------------------------------- limpiar el nombre que se muestra
/** Saca direcciones, números de pedido, opciones (Op1, Op2…) y nombres de personas agregados. `ctx` = { ciudad, provincia } (opcional). */
export function limpiarNombre(nombre, ctx = {}) {
  let s = String(nombre ?? '').replace(/[¨“”«»"]/g, '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  // «Sergio Cancio. Presidente del Club Agrario Argentino» → «Club Agrario Argentino»
  const cargo = s.match(new RegExp(`[.,;\\-–]\\s*(?:${CARGOS})\\s+(?:del|de la|de los|de las)\\s+(.+)$`, 'i'));
  if (cargo) s = cargo[1];
  // «Alejandro Ferrarotti (Ranch Sport)» → «Ranch Sport» (si lo de afuera es una persona)
  const par = s.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (par && evidenciaPersona(toks(par[1])) && !esGeneral(toks(par[1])[0] ?? '')) s = par[2];
  s = s.split('|')[0].trim();                                          // «La 10 | Fútbol» → «La 10»
  s = s.replace(/\s*[-–,.]?\s*\bpedido\s*(?:n[°º.]?\s*)?\d+.*$/i, '');   // «… Pedido N°988»
  s = s.replace(/\s*[-–,.]?\s*\bop(?:ci[oó]n)?\.?\s*(?:n[°º.]?\s*)?\d+\b.*$/i, ''); // «… Op1», «… Op N°3»
  s = s.replace(/\s+s\/n\b\.?/gi, '');                                  // «Los Chañares S/N»
  const lugares = new Set([ctx.ciudad, ctx.provincia].filter(Boolean).map(norm));
  const partes = s.split(/\s+[-–]\s+|,\s*/).map((x) => x.trim()).filter(Boolean);
  const buenas = partes.filter((p, i) => {
    if (/^entre\s/i.test(p)) return false;                              // «entre Perú y I. Árabes»
    if (PALABRAS_CALLE.test(p) && /\d|sin n[uú]mero/i.test(p)) return false; // «Calle 31 nº 753», «Calle Simón Bolívar sin número»
    if (PALABRAS_CALLE.test(p) && i > 0) return false;
    if (/\b\d{3,5}\s*$/.test(p) && !/\b(fut|futbol|fútbol|f)\s*\d/i.test(p)) return false;   // «Belgrano 1849» (número de calle)
    if (i > 0 && lugares.has(norm(p))) return false;                    // «… - Paraná, Entre Ríos»
    if (i > 0 && evidenciaPersona(toks(p), tokensLugar(ctx))) return false;   // «Club Banco Macro - Jorge Horacio Brito»
    return true;
  });
  s = (buenas.length ? buenas : partes.slice(0, 1)).join(' - ');
  s = s.replace(/\bentre\s+.+$/i, '').replace(/^[\s\-–.,;:|]+|[\s\-–.,;:|]+$/g, '').replace(/\s+/g, ' ');
  return acentuarYMayusculas(quitarNombreDePila(s));
}

/** «Pablo Club Atlético Susanense» → «Club Atlético Susanense»; «Ale del Instituto Cardenal Newman» → «Instituto Cardenal Newman»; «Alejandro de bardas padel» → «bardas padel». */
export function quitarNombreDePila(s) {
  const palabras = s.split(' ');
  const t = palabras.map((w) => norm(w));
  if (!NOMBRES_PILA.has(t[0]) || palabras.length < 2) return s;
  let i = 1;
  while (i < t.length && i <= 4 && !INSTITUCION_INICIO.has(t[i])) i++;
  if (i < t.length && i <= 4) return palabras.slice(i).join(' ');
  const resto = t.slice(2);
  if (t[1] === 'de' && resto.length >= 2 && !esGeneral(resto[0])) return palabras.slice(2).join(' ');   // «Alejandro de bardas padel»
  return s;
}

/** Pone tildes a palabras muy comunes («Atletico» → «Atlético») y mayúsculas si el nombre venía todo en minúsculas. */
export function acentuarYMayusculas(s) {
  let r = s.replace(/[\p{L}]+/gu, (w) => {
    const c = ACENTOS[norm(w)];
    if (!c || w !== w.normalize('NFD').replace(/[\u0300-\u036f]/g, '')) return w;   // ya tiene tilde
    return w === w.toUpperCase() && w.length > 1 ? c.toUpperCase() : w[0] === w[0].toUpperCase() ? c[0].toUpperCase() + c.slice(1) : c;
  });
  if (r && r === r.toLowerCase()) r = r.replace(/[\p{L}]+/gu, (w, i) => (i > 0 && STOP.has(norm(w)) ? w : w[0].toUpperCase() + w.slice(1)));
  return r;
}

/** Formato «Nombre de pila + Club/Municipalidad/Instituto/Barrio…» al inicio = una persona que se anotó delante de la institución. */
export function empiezaConNombreDePila(nombre) {
  const t = String(nombre ?? '').split(/\s+/).map((w) => norm(w));
  if (!NOMBRES_PILA.has(t[0])) return false;
  for (let i = 1; i <= 4 && i < t.length; i++) if (INSTITUCION_INICIO.has(t[i])) return true;
  return false;
}

// ---------------------------------------------------------------- ¿parece una persona?
/** Un nombre de pila junto a un apellido, o a un deporte («Veronica Futbol Tenis», «Luis de Padel»). */
export function evidenciaPersona(t, lugar = new Set()) {
  for (let i = 0; i < t.length; i++) {
    if (!NOMBRES_PILA.has(t[i]) || lugar.has(t[i])) continue;
    if (i > 0 && SANTO.has(t[i - 1])) continue;                         // «San José», «Santa Teresa»
    let j = i + 1;
    if (t[j]?.length === 1) j++;                                         // «Alberto J. Armando»
    const sig = t[j];
    const ant = t[i - 1];
    if (sig && !lugar.has(sig) && (esDesconocida(sig) || NOMBRES_PILA.has(sig))) return true;
    if (ant && !lugar.has(ant) && esDesconocida(ant)) return true;
    if (sig && DEPORTE.has(sig)) return true;
    if (sig === 'de' && DEPORTE.has(t[j + 1])) return true;
  }
  return false;
}

/** Evidencia fuerte de persona física en un nombre ya limpio. Es lo que verifica el test de la versión pública. */
export function parecePersona(nombre, ctx = {}) {
  const s = String(nombre ?? '');
  const t = toks(s);
  if (/^(cancha|canchas)\s+(de|del)\s+(?!futbol|padel|paddel|pelota|hockey|tenis)/i.test(norm(s))) return true;   // «Cancha de Sandra Tosoni»
  if (/^lo de\s+/.test(norm(s))) return true;                                                                    // «Lo de Pali»
  if (empiezaConNombreDePila(s)) return true;                                                                    // «Pablo Club Atlético…»
  return evidenciaPersona(t, tokensLugar(ctx));
}

// ---------------------------------------------------------------- propuesta para una obra
export function clasificarNombre(o) {
  const crudo = o.nombre_club;
  if (!crudo) return { propuesta: 'anonima', motivo: 'No tiene nombre cargado', limpio: '' };
  const limpio = limpiarNombre(crudo, { ciudad: o.ciudad, provincia: o.provincia });
  if (!limpio) return { propuesta: 'anonima', motivo: 'El nombre era solo una dirección o un número de pedido', limpio: '' };
  const crudoNorm = norm(crudo);
  if (ANONIMAS_EXACTAS.has(crudoNorm) || ANONIMAS_EXACTAS.has(norm(limpio))) return { propuesta: 'anonima', motivo: 'Pedido tuyo: se deja anónima', limpio };
  const todas = norm(limpio).split(' ').filter(Boolean);
  const sinCupo = todas.filter((x, k) => !(/^(5|6|7|8|9|11)$/.test(x) && DEPORTE_BASE.has(todas[k - 1])));   // «Fútbol 5» es genérico; «Club 77» o «La 10» no
  if (sinCupo.every((x) => VACIAS.has(x))) return { propuesta: 'anonima', motivo: 'Nombre genérico: no dice de qué club es', limpio };
  if (todas.some((x) => EMPRESA.has(x))) return { propuesta: 'anonima', motivo: 'Empresa que no es un complejo deportivo', limpio };
  const t = toks(limpio);
  const conInstitucionFuerte = t.some((x) => INSTITUCION_FUERTE.has(x));

  if (parecePersona(limpio, o)) {
    if (conInstitucionFuerte) return { propuesta: 'revisar', motivo: 'Institución que lleva nombre de persona: confirmá que se puede mostrar', limpio };
    const motivo = /^(cancha|canchas)\s+(de|del)\s/.test(norm(limpio)) ? 'Parece «Cancha de [persona]»' : /^lo de\s/.test(norm(limpio)) ? 'Parece «Lo de [persona]»' : 'Parece nombre de persona';
    return { propuesta: 'anonima', motivo, limpio };
  }
  // El cliente es una persona y su nombre de pila aparece en el nombre de la obra
  if (o.cliente_interno) {
    const c = toks(String(o.cliente_interno).replace(/\(.*?\)/g, ' ').split(/\.\s/)[0]);
    const lugar = tokensLugar(o);
    if (evidenciaPersona(c, lugar) && t.some((x) => NOMBRES_PILA.has(x) && c.includes(x) && !lugar.has(x) && !SANTO.has(t[t.indexOf(x) - 1] ?? ''))) {
      return { propuesta: 'anonima', motivo: 'El nombre incluye el de una persona (el cliente)', limpio };
    }
  }
  const nombrePropio = t.filter(esDesconocida);
  if (/^[^,]+\sy\s[^,]+$/i.test(limpio) && !t.some((x) => GENERICAS.has(x) && !STOP.has(x))) return { propuesta: 'revisar', motivo: 'Parece una esquina o una dirección', limpio };
  if (t.some((x) => INSTITUCION.has(x) || DEPORTE.has(x))) return { propuesta: 'nombrable', motivo: limpio !== String(crudo).trim() ? 'Se limpió el nombre (sin nombre de pila, dirección, pedido u opción)' : conInstitucionFuerte ? 'Institución (colegio, estadio, municipio…)' : t.includes('club') ? 'Club' : 'Complejo o empresa con nombre comercial', limpio };
  if (nombrePropio.length >= 2) return { propuesta: 'revisar', motivo: 'Dos o más palabras sin pistas de qué es: puede ser una persona o una marca', limpio };
  return { propuesta: 'revisar', motivo: 'Una sola palabra sin pistas de qué es: puede ser una persona o una marca', limpio };
}

export const PROPUESTAS = ['nombrable', 'anonima', 'revisar'];
export const normalizarPropuesta = (v) => {
  const n = norm(v);
  if (n.startsWith('nombrable')) return 'nombrable';
  if (n.startsWith('anonima') || n === 'anonimo') return 'anonima';
  if (n.startsWith('revisar')) return 'revisar';
  return null;
};

/**
 * Aplica la privacidad: para cada obra decide `nombrable` y el nombre limpio que se muestra.
 * `decisiones` = Map id → propuesta, de revisar-nombres.xlsx (lo que corrigió una persona manda sobre el cálculo automático).
 * Una obra destacada elegida por el equipo se propone como nombrable, salvo que parezca una persona.
 */
export function aplicarPrivacidad(obras, decisiones = new Map(), confirmados = new Map()) {
  const filas = [];
  for (const o of obras) {
    const auto = clasificarNombre(o);
    let { propuesta, motivo } = auto;
    if (o.destacada && propuesta === 'revisar' && o.nombre_club && !parecePersona(auto.limpio, o)) {
      propuesta = 'nombrable';
      motivo = 'Destacada: la elegiste vos para mostrar con nombre';
    }
    const manual = decisiones.get(o.id);
    const confirmado = confirmados.get(o.id);
    const decidida = manual && manual !== propuesta ? manual : null;
    if (manual) { propuesta = manual; if (decidida) motivo = 'Decidido por vos en revisar-nombres.xlsx'; }
    if (propuesta === 'nombrable' && auto.limpio && parecePersona(auto.limpio, o) && !toks(auto.limpio).some((x) => INSTITUCION_FUERTE.has(x))) {
      propuesta = 'anonima';   // aunque alguien lo marque como nombrable, una persona física nunca se muestra
      motivo = 'Bloqueada por privacidad: parece nombre de una persona';
    }
    let limpio = auto.limpio;
    if (confirmado) {   // el dueño confirmó que se puede nombrar, con este nombre: manda sobre todo lo demás
      propuesta = 'nombrable';
      motivo = 'Confirmado por el dueño (nombre exacto)';
      limpio = confirmado;
    }
    o.nombrable = propuesta === 'nombrable' && Boolean(limpio);
    o.nombre_publico = o.nombrable ? limpio : null;
    filas.push({ id: o.id, publicar: o.publicar, nombre: o.nombre_club ?? '', limpio: o.nombrable ? limpio : auto.limpio, ciudad: o.ciudad ?? '', provincia: o.provincia ?? '', deporte: o.deporte, cliente: o.cliente_interno ?? '', propuesta, motivo, manual: Boolean(manual) });
  }
  return filas;
}

/** ¿El nombre lleva una palabra de institución fuerte (colegio, estadio, municipalidad…)? Esas pueden llevar el nombre de una persona (homenaje). */
export const esInstitucionFuerte = (nombre) => toks(nombre).some((x) => INSTITUCION_FUERTE.has(x));
