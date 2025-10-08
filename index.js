const express = require('express');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));

// Salud para comprobar que vive
app.get('/', (req, res) => res.send('Bot de WhatsApp activo 🚀'));

// Webhook que Twilio llamará por POST
app.post('/whatsapp', (req, res) => {
  const twiml = new MessagingResponse();
  const body = (req.body?.Body || '').trim();
  const bodyLower = body.toLowerCase(); // normalizamos a minúsculas

  let reply;

  if (bodyLower === 'hola') {
    reply = '¡Hola! Soy tu bot de prueba 🤖';
  } else if (bodyLower.includes('cliente:')) {
    reply = 'Pedido recibido, ten en cuenta que dura al menos 3 días en prepararse el pedido fresco. Gracias';
  } else {
    reply = `Recibí: "${body}" ✅`;
  }

  twiml.message(reply);
  res.type('text/xml').send(twiml.toString());
});

// Render/Heroku/railway usan PORT de entorno
const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Escuchando en ' + port));
