// bot-whatsapp.js
require('dotenv').config();
const express = require('express');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));

// ===== Memoria en RAM por número =====
const sessions = new Map(); // key: From (whatsapp:+506...), value: { name: '...' }

// Config zona horaria (opcional via .env)
const TZ = process.env.BOT_TZ || 'America/Costa_Rica';

// Utilidades
const nowInTZ = (tz = TZ) => {
  try {
    return new Intl.DateTimeFormat('es-CR', {
      timeZone: tz,
      dateStyle: 'full',
      timeStyle: 'medium',
    }).format(new Date());
  } catch {
    return new Date().toString();
  }
};

// Chistes simples
const JOKES = [
  '—¿Me da un café? —Se le cayó. —¿Otro? —Se le cayó.',
  'Yo no ronco… sueño que soy una moto. 🏍️💤',
  '—Doctor, veo borroso. —¿Quién habla? —Soy la impresora.',
];

function helpText(name) {
  const saludo = name ? `¡Hola ${name}!` : '¡Hola!';
  return (
`${saludo} Soy tu bot de prueba 🤖

Comandos disponibles:
• hola — saludo + menú
• menu / ayuda — ver este menú
• nombre <tu nombre> — guardo tu nombre
• mi nombre? — te digo el nombre guardado
• hora — fecha y hora locales
• eco <texto> — repito lo que envíes
• dado [lados] — tiro un dado (por defecto 6)
• calc <expresión> — suma/resta/multiplica/divide^potencias
• chiste — te cuento uno

También entiendo:
• Imágenes/audio/documentos: te confirmo que los recibí
• Ubicación: te digo lat/lon que enviaste`
  );
}

// Eval matemático seguro (solo números, (), + - * / ^ . y espacios)
function safeCalc(expr) {
  if (!/^[\d\s+/*()^.\-]+$/.test(expr)) {
    throw new Error('Expresión no permitida.');
  }
  // Reemplazar ^ por ** para potencia en JS
  const jsExpr = expr.replace(/\^/g, '**');
  // eslint-disable-next-line no-new-func
  const fn = new Function(`return (${jsExpr});`);
  const result = fn();
  if (typeof result !== 'number' || !isFinite(result)) {
    throw new Error('Resultado no numérico.');
  }
  return result;
}

// Ping de vida
app.get('/', (req, res) => res.send('Bot de WhatsApp activo 🚀'));

// Webhook de Twilio (POST)
app.post('/whatsapp', (req, res) => {
  const twiml = new MessagingResponse();

  // Campos útiles de Twilio
  const body = (req.body?.Body || '').trim();
  const from = req.body?.From || '';
  const numMedia = parseInt(req.body?.NumMedia || '0', 10);
  const latitude = req.body?.Latitude;
  const longitude = req.body?.Longitude;

  // Sesión
  if (!sessions.has(from)) sessions.set(from, {});
  const session = sessions.get(from);

  // Normalizamos texto
  const t = body.toLowerCase();

  // 1) Mensajes con medios
  if (numMedia > 0) {
    const urls = [];
    for (let i = 0; i < numMedia; i++) {
      urls.push(req.body[`MediaUrl${i}`]);
    }
    twiml.message(
      `📎 Recibí ${numMedia} archivo(s).\n` +
      urls.map((u, i) => `#${i + 1}: ${u}`).join('\n')
    );
    return res.type('text/xml').send(twiml.toString());
  }

  // 2) Ubicación (WhatsApp puede enviar lat/lon en campos separados)
  if (latitude && longitude) {
    twiml.message(`📍 Gracias por la ubicación.\nLat: ${latitude}\nLon: ${longitude}`);
    return res.type('text/xml').send(twiml.toString());
  }

  // 3) Ruteo por comandos
  let reply;

  // hola
  if (t === 'hola' || t === 'hello' || t === 'hi') {
    reply = helpText(session.name);
  }

  // menu / ayuda
  else if (t === 'menu' || t === 'ayuda' || t === '?') {
    reply = helpText(session.name);
  }

  // nombre <algo>
  else if (t.startsWith('nombre ')) {
    const name = body.slice(7).trim();
    if (name) {
      session.name = name;
      sessions.set(from, session);
      reply = `¡Encantado, ${name}! ✍️ He guardado tu nombre.\nEscribe *menu* para ver opciones.`;
    } else {
      reply = 'Por favor, envía:  *nombre TuNombre*';
    }
  }

  // mi nombre?
  else if (t === 'mi nombre?' || t === 'mi nombre ?' || t === 'mi nombre') {
    reply = session.name
      ? `Tienes guardado el nombre: *${session.name}*`
      : 'Aún no tengo tu nombre. Envíame:  *nombre TuNombre*';
  }

  // hora
  else if (t === 'hora' || t === 'fecha' || t === 'tiempo') {
    reply = `🕒 ${nowInTZ()}`;
  }

  // eco <texto>
  else if (t.startsWith('eco ')) {
    const msg = body.slice(4).trim();
    reply = msg ? `🗣️ ${msg}` : 'Usa: *eco Tu mensaje*';
  }

  // dado [lados]
  else if (t.startsWith('dado')) {
    const parts = t.split(/\s+/);
    const sides = Math.max(2, Math.min(1000, parseInt(parts[1] || '6', 10) || 6));
    const roll = 1 + Math.floor(Math.random() * sides);
    reply = `🎲 D${sides} → *${roll}*`;
  }

  // calc <expresión>
  else if (t.startsWith('calc ')) {
    const expr = body.slice(5).trim();
    if (!expr) {
      reply = 'Usa: *calc 12.5*3-2^2*  (permitidos: + - * / ^ ( ) )';
    } else {
      try {
        const result = safeCalc(expr);
        reply = `🧮 ${expr} = *${result}*`;
      } catch (e) {
        reply = `No pude calcular eso. ${e.message}`;
      }
    }
  }

  // chiste
  else if (t === 'chiste' || t === 'cuentachiste') {
    reply = '😂 ' + JOKES[Math.floor(Math.random() * JOKES.length)];
  }

  // fallback
  else {
    // pequeño “intento” de onboarding si solo envían una palabra
    if (!session.name && /^[a-záéíóúñü\s]{2,20}$/i.test(body) && body.split(/\s+/).length === 1) {
      reply = `¿Te llamas *${body}*? Si quieres, guarda tu nombre con:\n*nombre ${body}*\n\nEscribe *menu* para ver todo lo que puedo hacer.`;
    } else {
      reply = `Recibí: "${body}" ✅\nEscribe *menu* para ver opciones.`;
    }
  }

  const message = twiml.message(reply);
  // (Opcional) Responder con un botón “Menu” usando WhatsApp Interactive (solo Business API, no sandbox)
  // Nota: Para simplicidad mantenemos mensaje de texto plano.

  res.type('text/xml').send(twiml.toString());
});

// Puerto
const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Escuchando en ' + port));
