#!/usr/bin/env python3
"""Local preview server for the Tutee Connect Ireland landing page.

    python3 serve.py            # http://localhost:8000
    python3 serve.py 3000       # pick a port

Binds dual-stack (IPv6 + IPv4) so `localhost`, `127.0.0.1` and `[::1]` all
work — the stock `python3 -m http.server` binds IPv4 only, and on macOS
`localhost` resolves to `::1` first.

Serves from this file's own directory, so it doesn't matter where you run it
from. Sends no-cache headers so a browser reload always shows your latest edit.

Also answers GET /api/news, a port of netlify/functions/news.mjs, so the live
news ticker works in a local preview too. Keep the two in step.
"""
import email.utils
import html
import http.server
import json
import os
import re
import socket
import socketserver
import sys
import threading
import time
import urllib.parse
import urllib.request
import webbrowser

try:
    sys.stdout.reconfigure(line_buffering=True)
except (AttributeError, ValueError):
    pass

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = os.path.dirname(os.path.abspath(__file__))


# ------------------------------------------------------------ /api/news
# Mirrors netlify/functions/news.mjs: same searches, same filters.
NEWS_TOPICS = [
    ('Universities', '("Irish universities" OR "Trinity College Dublin" OR UCD OR "University College Cork" OR "University of Galway" OR DCU OR "University of Limerick" OR "TU Dublin" OR "Maynooth University") when:14d',
     r'universit|college|campus|student|research|scholar|degree|graduat|lecturer|professor|academ|programme|course'),
    ('Students', 'Ireland ("international students" OR "study in Ireland" OR "student visa" OR "non-EU students") when:30d',
     r'student|study|visa|graduat|degree|international'),
    ('Careers', 'Ireland ("Critical Skills" OR "employment permit" OR "graduate jobs" OR "skills shortage" OR "Stamp 4") when:30d',
     r'permit|visa|skill|jobs?\b|hiring|career|graduate|employ|talent|recruit|stamp 4|workers?\b'),
    ('Scholarships', 'Ireland (scholarship OR scholarships OR bursary) university when:30d',
     r'scholar|bursar|fellowship|award'),
    ('Industry', 'Ireland (tech OR pharma OR medtech) (jobs OR hiring OR "European headquarters") when:14d',
     r'jobs?\b|hiring|headquarters|\bhq\b|invest|expan|pharma|medtech|engineer|facility|sector|operations|office'),
]
NEWS_PER_TOPIC = 4
NEWS_IRISH = re.compile(r'ireland|irish|dublin|cork|galway|limerick|maynooth|waterford|athlone|dundalk|kilkenny|wexford|sligo|carlow|letterkenny|tralee|trinity|\bucd\b|\bdcu\b|\bucc\b|\bul\b|\batu\b|\bsetu\b|\bmtu\b|\btus\b|\brcsi\b', re.I)
NEWS_MONEY = re.compile(r'[€£$₹]\s?\d|\d\s?(?:euro|eur|million|billion|bn|m|k)\b|\beuros?\b|\bfees?\b|\bcost|salar|wage|\bpay\b|\bearn', re.I)
NEWS_ELSEWHERE = re.compile(r'northern ireland|\bni\b|belfast|derry|\buk\b|britain|british|england|scotland|wales|london', re.I)
NEWS_OFF_TONE = re.compile(r'trash|damage|destroy|riot|death|dead|dies|died|kill|murder|assault|attack|crash|arrest|charged|court|garda|police|protest|strike|crisis|cuts?\b|scandal|abuse|fraud|war\b|gaza|palestin|israel|asylum|deport|refus|reject|experiment|party|drug|fire\b|collapse|layoff|redundanc|job losses|closure|row\b|anger|outcry|warn|\bdip|declin|slump|plunge|fewer', re.I)
NEWS_TTL = 900
_news_cache = {'at': 0.0, 'body': None}
_news_lock = threading.Lock()


def _rss_field(block, name):
    m = re.search(r'<%s[^>]*>([\s\S]*?)</%s>' % (name, name), block)
    if not m:
        return ''
    text = re.sub(r'<!\[CDATA\[([\s\S]*?)\]\]>', r'\1', m.group(1))
    return re.sub(r'\s+', ' ', html.unescape(text)).strip()


def _news_topic(tag, query, about):
    url = ('https://news.google.com/rss/search?q=' + urllib.parse.quote(query)
           + '&hl=en-IE&gl=IE&ceid=IE:en')
    req = urllib.request.Request(url, headers={
        'User-Agent': 'TuteeConnect-Ireland-NewsTicker/1.0', 'Accept': 'application/rss+xml'})
    try:
        with urllib.request.urlopen(req, timeout=8) as res:
            xml = res.read().decode('utf-8', 'replace')
    except Exception as exc:  # one topic failing doesn't sink the rest
        sys.stderr.write('  news: %s: %s\n' % (tag, exc))
        return []
    about_re = re.compile(about, re.I)
    items = []
    for block in re.findall(r'<item>([\s\S]*?)</item>', xml):
        source = _rss_field(block, 'source')
        title = _rss_field(block, 'title')
        if source and title.endswith(' - ' + source):
            title = title[:-(len(source) + 3)]
        title = re.sub(r'[\s,;:&|–-]+$', '', title)
        link = _rss_field(block, 'link')
        try:
            date = email.utils.parsedate_to_datetime(_rss_field(block, 'pubDate'))
        except (TypeError, ValueError):
            continue
        if not title or len(title) > 140 or not link.startswith('https://'):
            continue
        if not NEWS_IRISH.search(title) or not about_re.search(title):
            continue
        if (NEWS_MONEY.search(title) or NEWS_ELSEWHERE.search(title + ' ' + source)
                or NEWS_OFF_TONE.search(title)):
            continue
        items.append({'title': title, 'source': source, 'link': link,
                      'date': date.strftime('%Y-%m-%dT%H:%M:%S.000Z'), 'tag': tag})
    items.sort(key=lambda it: it['date'], reverse=True)
    return items


def news_body():
    with _news_lock:
        if _news_cache['body'] and time.time() - _news_cache['at'] < NEWS_TTL:
            return 200, _news_cache['body']
        seen, picked = set(), []
        for topic in NEWS_TOPICS:
            kept = []
            for it in _news_topic(*topic):
                key = re.sub(r'[^a-z0-9]+', '', it['title'].lower())
                if key not in seen:
                    seen.add(key)
                    kept.append(it)
            picked.append(kept[:NEWS_PER_TOPIC])
        items = [lst[i] for i in range(NEWS_PER_TOPIC) for lst in picked if i < len(lst)]
        body = json.dumps({'updated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                           'items': items}).encode('utf-8')
        if items:
            _news_cache.update(at=time.time(), body=body)
        return (200 if items else 502), body


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map)
    extensions_map.update({
        '.webp': 'image/webp',
        '.woff2': 'font/woff2',
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
    })

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        if self.path.split('?')[0] == '/api/news':
            status, body = news_body()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self):
        # always serve fresh files while editing
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def log_message(self, fmt, *args):
        status = args[1] if len(args) > 1 else ''
        # only surface problems, not every 200
        if not str(status).startswith('2'):
            sys.stderr.write('  %s %s\n' % (status, args[0] if args else ''))


class DualStackServer(socketserver.ThreadingTCPServer):
    address_family = socket.AF_INET6
    daemon_threads = True
    allow_reuse_address = True

    def server_bind(self):
        # accept IPv4 connections on the same socket
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except (AttributeError, OSError):
            pass
        super().server_bind()


def bind(preferred):
    """Take the requested port, or the next free one. 'Address already in use'
    is the usual reason a local preview appears not to work."""
    for port in range(preferred, preferred + 20):
        try:
            return DualStackServer(('::', port), Handler), port
        except OSError:
            continue
    sys.exit('No free port between %d and %d. Close whatever is using them, '
             'or pass a port: python3 serve.py 4000' % (preferred, preferred + 19))


if __name__ == '__main__':
    if not os.path.exists(os.path.join(ROOT, 'index.html')):
        sys.exit('index.html is not next to serve.py — expected it in %s' % ROOT)

    server, PORT = bind(PORT)
    url = 'http://localhost:%d/' % PORT

    print('Tutee Connect Ireland — serving %s' % ROOT)
    print('')
    print('  Home page:    %s' % url)
    print('  Universities: %suniversities.html' % url)
    print('')
    if PORT != (int(sys.argv[1]) if len(sys.argv) > 1 else 8000):
        print('  (port %d was busy, used %d instead)' % (
            int(sys.argv[1]) if len(sys.argv) > 1 else 8000, PORT))
        print('')
    print('Leave this window open while you browse. Press Ctrl+C to stop.\n')
    try:
        webbrowser.open(url)
    except Exception:
        pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
