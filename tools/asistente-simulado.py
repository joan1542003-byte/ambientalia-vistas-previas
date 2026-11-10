"""Asistente simulado para probar la burbuja de Ambientalia (wordpress/ambientalia-asistente) sin el servicio real.

Responde el mismo contrato que el asistente de Transporte Autorizado (docs/integracion-widget-chatbot.md): sesiones,
turnos con client_message_id, historial, borrado y los enlaces legales. Las respuestas son de ejemplo y no dicen nada
normativo real. Uso:
    python3 tools/asistente-simulado.py            # http://127.0.0.1:8794
y abre ambientalia-asistente.html?asistente=http://127.0.0.1:8794 en el servidor local de este repositorio.
Para probar fallas: escribe «lento» (tarda 4 s), «error» (503) o «caducar» (la sesión vence: 401).
"""
import json
import secrets
import sys
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8794
SESIONES = {}  # token -> {datos, mensajes, usados, respuestas}
MAX = 10

MENU = [
    {'id': 'tema:permisos', 'label': 'Permisos ambientales'},
    {'id': 'tema:declaraciones', 'label': 'Declaraciones (RETC, SIDREP)'},
    {'id': 'tema:rep', 'label': 'Ley REP'},
    {'id': 'tema:acv', 'label': 'ACV y ecodiseño'},
    {'id': 'contacto', 'label': 'Hablar con una persona'},
]
RESPUESTAS = {
    'tema:permisos': {
        'text': 'Te ayudo con **permisos ambientales** (respuesta de ejemplo del asistente simulado).\n\nPara orientarte necesito saber:\n- Qué tipo de proyecto u operación es.\n- En qué región está.\n- Si es nuevo, una modificación o una regularización.',
        'options': [{'id': 'permisos:nuevo', 'label': 'Proyecto nuevo'}, {'id': 'permisos:modificacion', 'label': 'Modificación'}, {'id': 'inicio', 'label': 'Volver al menú'}],
        'sources': [{'label': 'Ley 19.300, Bases Generales del Medio Ambiente', 'url': 'https://www.bcn.cl/leychile/navegar?idNorma=30667'}],
    },
    'tema:declaraciones': {
        'text': 'Las **declaraciones ambientales** más comunes son:\n1. RETC (emisiones y residuos).\n2. SIDREP (residuos peligrosos).\n3. Formularios sectoriales.\n\nRespuesta de ejemplo del asistente simulado.',
        'options': [{'id': 'inicio', 'label': 'Volver al menú'}],
        'sources': [{'label': 'Ventanilla Única RETC', 'url': 'https://retc.mma.gob.cl/'}],
    },
    'tema:rep': {
        'text': 'La **Ley REP (20.920)** obliga a los productores de productos prioritarios a hacerse cargo de sus residuos.\n\nRespuesta de ejemplo del asistente simulado.',
        'options': [{'id': 'inicio', 'label': 'Volver al menú'}],
        'sources': [{'label': 'Ley 20.920', 'url': 'https://www.bcn.cl/leychile/navegar?idNorma=1090894'}, {'label': 'Un enlace no confiable (no debe enlazarse)', 'url': 'javascript:alert(1)'}],
    },
    'tema:acv': {'text': 'El **ACV** mide los impactos de un producto en todo su ciclo de vida. Respuesta de ejemplo.', 'options': [{'id': 'inicio', 'label': 'Volver al menú'}], 'sources': []},
    'contacto': {'text': 'Te contactaremos a la brevedad con los datos que dejaste. Respuesta de ejemplo.', 'options': [{'id': 'inicio', 'label': 'Volver al menú'}], 'sources': []},
}


def ahora():
    return datetime.now(timezone.utc)


def respuesta_para(texto, opcion, s):
    clave = (opcion or texto or '').strip().lower()
    if clave in ('inicio', 'menu', 'menú', 'reiniciar'):
        return {'text': f'¿En qué te ayudo, {s["datos"]["name"].split()[0]}? Elige un tema o escribe tu pregunta.', 'options': MENU, 'sources': []}
    if clave in RESPUESTAS:
        return RESPUESTAS[clave]
    return {'text': f'Recibí tu pregunta: «{texto[:200]}». Soy el asistente simulado: en el servicio real, aquí va la respuesta de la IA.\n\n<b>Esto es texto</b>, no HTML.', 'options': [{'id': 'inicio', 'label': 'Volver al menú'}], 'sources': []}


class Manejador(BaseHTTPRequestHandler):
    def _cors(self):
        origen = self.headers.get('Origin')
        if origen:
            self.send_header('Access-Control-Allow-Origin', origen)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')

    def _json(self, estado, cuerpo):
        datos = json.dumps(cuerpo, ensure_ascii=False).encode()
        self.send_response(estado)
        self._cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def _cuerpo(self):
        n = int(self.headers.get('Content-Length') or 0)
        try:
            return json.loads(self.rfile.read(n) or b'{}')
        except json.JSONDecodeError:
            return {}

    def _sesion(self):
        auth = self.headers.get('Authorization', '')
        token = auth[7:] if auth.startswith('Bearer ') else ''
        return token, SESIONES.get(token)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path in ('/condiciones-del-servicio', '/politica-de-privacidad', '/eliminacion-de-datos'):
            texto = f'<!doctype html><meta charset="utf-8"><title>{self.path[1:]}</title><p>Texto legal de ejemplo del asistente simulado ({self.path}).</p>'.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(texto)
            return
        if self.path == '/api/chat/history':
            _, s = self._sesion()
            if not s:
                return self._json(401, {'error': 'session_expired', 'message': 'La sesión terminó.'})
            return self._json(200, {'messages': s['mensajes'], 'usage': {'max': MAX, 'used': s['usados'], 'remaining': MAX - s['usados'], 'resets_at': None}})
        self._json(404, {'error': 'not_found'})

    def do_POST(self):
        b = self._cuerpo()
        if self.path == '/api/chat/sessions':
            errores = {}
            if not (2 <= len(str(b.get('name', '')).strip()) <= 150):
                errores['name'] = ['El nombre debe tener entre 2 y 150 caracteres.']
            if '@' not in str(b.get('email', '')):
                errores['email'] = ['El correo no es válido.']
            if not (8 <= len(''.join(c for c in str(b.get('phone', '')) if c.isdigit())) <= 15):
                errores['phone'] = ['El teléfono debe tener entre 8 y 15 dígitos.']
            if b.get('privacy_accepted') is not True:
                errores['privacy_accepted'] = ['Debes aceptar las condiciones y el aviso de privacidad.']
            if b.get('website'):
                return self._json(422, {'message': 'Solicitud inválida.', 'errors': {'website': ['validation.prohibited']}})
            if errores:
                return self._json(422, {'message': 'Revisa tus datos.', 'errors': errores})
            token = secrets.token_urlsafe(32)
            s = {'datos': b, 'mensajes': [], 'usados': 0, 'respuestas': {}}
            SESIONES[token] = s
            reply = respuesta_para('inicio', None, s)
            s['mensajes'].append({'role': 'assistant', **reply})
            return self._json(201, {'token': token, 'expires_at': (ahora() + timedelta(hours=24)).isoformat(), 'reply': reply, 'usage': {'max': MAX, 'used': 0, 'remaining': MAX, 'resets_at': None}})
        if self.path == '/api/chat/messages':
            token, s = self._sesion()
            if not s:
                return self._json(401, {'error': 'session_expired', 'message': 'La sesión terminó.'})
            cid = str(b.get('client_message_id', ''))
            if cid in s['respuestas']:
                return self._json(200, {'reply': s['respuestas'][cid], 'duplicate': True, 'usage': {'max': MAX, 'used': s['usados'], 'remaining': MAX - s['usados'], 'resets_at': None}})
            texto, opcion = str(b.get('text', '') or ''), b.get('option_id')
            if texto.strip().lower() == 'error':
                return self._json(503, {'error': 'unavailable', 'message': 'El asistente no está disponible en este momento (simulado).'})
            if texto.strip().lower() == 'caducar':
                SESIONES.pop(token, None)
                return self._json(401, {'error': 'session_expired', 'message': 'La sesión terminó.'})
            time.sleep(4 if texto.strip().lower() == 'lento' else 0.9)
            etiqueta = next((o['label'] for o in MENU if o['id'] == opcion), opcion)
            if texto or (opcion and opcion != 'inicio'):
                s['mensajes'].append({'role': 'user', 'text': texto or etiqueta or ''})
            gasta = not (opcion == 'inicio' or texto.strip().lower() == 'inicio')
            if gasta:
                s['usados'] += 1
            reply = respuesta_para(texto, opcion, s)
            s['mensajes'].append({'role': 'assistant', **reply})
            s['respuestas'][cid] = reply
            return self._json(200, {'reply': reply, 'usage': {'max': MAX, 'used': s['usados'], 'remaining': MAX - s['usados'], 'resets_at': None}})
        self._json(404, {'error': 'not_found'})

    def do_DELETE(self):
        if self.path == '/api/chat/session':
            token, s = self._sesion()
            if not s:
                return self._json(401, {'error': 'session_expired'})
            SESIONES.pop(token, None)
            return self._json(200, {'deleted': True})
        self._json(404, {'error': 'not_found'})

    def log_message(self, fmt, *args):
        sys.stderr.write(f'[asistente simulado] {self.command} {self.path} → {args[1] if len(args) > 1 else ""}\n')


if __name__ == '__main__':
    print(f'Asistente simulado en http://127.0.0.1:{PUERTO}')
    ThreadingHTTPServer(('127.0.0.1', PUERTO), Manejador).serve_forever()
