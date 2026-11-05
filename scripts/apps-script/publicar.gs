// Google Apps Script del Sheet «Mapa SLAVON» (Extensiones → Apps Script). Es el «despertador» del sistema:
// GitHub no cumple los horarios con puntualidad (puede tardar horas), así que el Sheet le avisa a GitHub cuando hay que publicar.
// No guarda datos de obras: solo le pide a GitHub que corra el workflow «pages.yml».
// Necesita UNA propiedad del proyecto: GITHUB_TOKEN (token fino de GitHub, solo con permiso «Actions: Read and write» sobre este repositorio).

const REPO = 'Caixx32/mapa-obras-slavon';
const WORKFLOW = 'pages.yml';

function disparar_(modo) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('Falta la propiedad GITHUB_TOKEN (Configuración del proyecto → Propiedades de la secuencia de comandos).');
  const r = UrlFetchApp.fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    payload: JSON.stringify({ ref: 'main', inputs: { modo } }),
    muteHttpExceptions: true,
  });
  return r.getResponseCode();   // 204 = GitHub aceptó el pedido
}

// Se ejecuta sola cada vez que se edita el Sheet (también desde el celular).
function alEditar(e) {
  const hoja = e.range.getSheet();
  const nombre = hoja.getName();
  if (nombre === 'AVISOS' && e.range.getA1Notation() === 'B5' && String(e.value).toUpperCase() === 'TRUE') {
    disparar_('manual');                                                  // «Publicar ahora»
  } else if (nombre === 'MAPA' && e.range.getRow() > 1 && e.range.getColumn() > 1 && !hoja.getRange(e.range.getRow(), 1).getValue()) {
    const props = PropertiesService.getScriptProperties();                // fila nueva sin ID: que el robot le ponga ID y cree su carpeta
    if (Date.now() - Number(props.getProperty('ultimoAviso') || 0) > 60 * 1000) {
      props.setProperty('ultimoAviso', String(Date.now()));
      disparar_('poll');
    }
  }
}

// Todas las noches a las 3 AM (hora de Argentina): publica solo si hubo cambios.
function publicacionNocturna() { disparar_('nocturno'); }

// Se corre UNA vez a mano: instala los dos avisos automáticos.
function instalar() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('alEditar').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  ScriptApp.newTrigger('publicacionNocturna').timeBased().atHour(3).everyDays(1).inTimezone('America/Argentina/Buenos_Aires').create();
}

// Para probar la conexión desde el editor: tiene que devolver 204.
function probarConexion() { Logger.log(disparar_('poll')); }
