#!/usr/bin/env python3
"""Generates assets/portal-light.css from the colours portal.html actually uses (2026-10-26).
The portal is built dark with inline styles; this skin remaps ONLY surfaces, neutral text and borders to the brand
light palette (cream #F3EDE3, surface #FDFAF6, ink #1A1A1A). Brand fills (lime #8DC63F, blue, status colours) are never
touched. Accent TEXT gets a darker shade of the same hue so it stays readable on cream. Re-run after adding new
neutral colours:  python3 scripts/gen-portal-light.py"""
import re, sys
src = open('portal.html').read()
def parse(c):
    c = c.strip().lower()
    m = re.match(r'#([0-9a-f]{3})$', c)
    if m: h = ''.join(x*2 for x in m.group(1)); return tuple(int(h[i:i+2],16) for i in (0,2,4)) + (1.0,)
    m = re.match(r'#([0-9a-f]{6})$', c)
    if m: h = m.group(1); return tuple(int(h[i:i+2],16) for i in (0,2,4)) + (1.0,)
    m = re.match(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)', c)
    if m: return int(m.group(1)), int(m.group(2)), int(m.group(3)), float(m.group(4) or 1)
    return None
def lum(r,g,b): return (0.2126*r+0.7152*g+0.0722*b)/255
def sat(r,g,b): return (max(r,g,b)-min(r,g,b))/255
SURF, INK, MUTE, DIM = '#FDFAF6', '#1A1A1A', '#4a5260', '#6b7280'
def map_bg(tok):
    p = parse(tok)
    if not p: return None
    r,g,b,a = p
    if (r,g,b) == (255,255,255) and a < 1: return 'rgba(26,26,26,%s)' % round(min(0.12, a*0.85+0.01), 3)   # white overlay -> ink overlay
    if a >= 0.9 and lum(r,g,b) < 0.22 and sat(r,g,b) < 0.25: return SURF                                  # dark neutral surface
    return None
def map_color(tok):
    p = parse(tok)
    if not p: return None
    r,g,b,a = p
    key = (r,g,b)
    ACC = {(141,198,63):'#4F8A10', (74,158,255):'#1d6fd6', (255,170,0):'#9a6208', (245,158,11):'#9a6208', (239,68,68):'#c62828',
           (196,163,240):'#6d3fc0', (155,109,232):'#6d3fc0', (232,121,58):'#b45309', (251,146,60):'#b45309', (248,113,113):'#c62828',
           (255,138,138):'#c62828', (239,155,155):'#c62828', (148,163,184):'#5b6472'}
    if key in ACC: return ACC[key]
    if sat(r,g,b) >= 0.3 and lum(r,g,b) > 0.45 and a >= 0.8:   # any other bright accent text: same hue, darker, for cream
        return '#%02x%02x%02x' % tuple(int(v*0.58) for v in (r,g,b))
    if sat(r,g,b) < 0.22:
        l = lum(r,g,b)
        if l > 0.80: return INK            # white / cream / near-white text
        if l > 0.50: return MUTE           # light greys (#aaa #bbb #999 #888)
        if l > 0.30: return DIM            # dim greys (#777 #666 #555 #444)
    return None
rules, seen = [], set()
def add(sel, decl):
    k = (sel, decl)
    if k not in seen: seen.add(k); rules.append(sel + '{' + decl + '}')
H = 'html.pv-light '
# 1) inline-style tokens (HTML attributes and JS string literals), with and without a space after the colon
for m in re.finditer(r'(?<![-\w])background(?:-color)?:\s*(#[0-9a-fA-F]{3,6}|rgba?\([^)]*\))', src):
    tok = m.group(1); v = map_bg(tok)
    if not v: continue
    norm = re.sub(r'\s+', '', tok)
    for sp in ('', ' '): add(H + '[style*="background:%s%s"]' % (sp, tok if sp == '' else tok), 'background:%s!important' % v)
    add(H + '[style*="background:%s"]' % norm, 'background:%s!important' % v)
for m in re.finditer(r'(?<![-\w])color:\s*(#[0-9a-fA-F]{3,6}|rgba?\([^)]*\))', src):
    tok = m.group(1); v = map_color(tok)
    if not v: continue
    norm = re.sub(r'\s+', '', tok)
    for form in {tok, norm}:
        for sp in ('', ' '):
            add(H + '[style*=";color:%s%s"]' % (sp, form), 'color:%s!important' % v)
            add(H + '[style*="; color:%s%s"]' % (sp, form), 'color:%s!important' % v)
            add(H + '[style*="\\"color:%s%s"]' % (sp, form) if False else H + '[style*="\'color:%s%s"]' % (sp, form), 'color:%s!important' % v)
            add(H + '[style="color:%s%s"]' % (sp, form), 'color:%s!important' % v)
            add(H + '[style^="color:%s%s"]' % (sp, form), 'color:%s!important' % v)
for m in re.finditer(r'border(?:-[a-z]+)?:\s*[^;"\']*?(rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*[\d.]+\s*\))', src):
    tok = re.sub(r'\s+', '', m.group(1))
    add(H + '[style*="%s"]' % tok.replace('rgba(255,255,255', 'solid rgba(255,255,255') if False else H + '[style*="solid %s"]' % tok, 'border-color:rgba(26,26,26,0.16)!important')
# 2) class rules from <style> blocks
for blk in re.findall(r'<style[^>]*>(.*?)</style>', src, flags=re.S):
    blk = re.sub(r'/\*.*?\*/', '', blk, flags=re.S)
    blk = re.sub(r'@media[^{]*\{(.*?\}\s*)\}', lambda mm: mm.group(1), blk, flags=re.S)
    for m in re.finditer(r'([^{}@]+)\{([^{}]*)\}', blk):
        sels = [x.strip() for x in m.group(1).split(',') if x.strip() and 'keyframes' not in x and not x.strip().startswith(('from', 'to', '0%', '100%'))]
        body = m.group(2); decl = []
        for d in re.finditer(r'(?<![-\w])(background(?:-color)?|color|border(?:-[a-z]+)?-color|border(?:-[a-z]+)?)\s*:\s*([^;]+)', body):
            prop, val = d.group(1), d.group(2).strip()
            tok = re.search(r'(#[0-9a-fA-F]{3,6}\b|rgba?\([^)]*\))', val)
            if not tok: continue
            t = tok.group(1)
            if prop.startswith('background'):
                v = map_bg(t)
                if v and (val == t): decl.append('background:%s!important' % v)
            elif prop == 'color':
                v = map_color(t)
                if v and val == t: decl.append('color:%s!important' % v)
            else:
                p = parse(t)
                if p and p[:3] == (255,255,255) and p[3] < 1: decl.append('%s:rgba(26,26,26,0.16)!important' % ('border-color' if 'color' in prop or True else prop))
        if decl:
            for s_ in sels:
                if s_.startswith(('html', ':root', 'body.cust')): continue
                if s_ == 'body' or s_ == 'html': continue
                add('html.pv-light ' + s_, ';'.join(dict.fromkeys(decl)))
head = '''/* Portal light skin (generated by scripts/gen-portal-light.py, 2026-10-26, per Dennis: keep the brand tones, no new colours).
   Only neutral surfaces, neutral text and borders are remapped. Lime, blue and status fills are untouched; accent TEXT uses a
   darker shade of its own hue so it stays readable on cream. Applied only under html.pv-light (staff and ops screens). */
html.pv-light{background:#F3EDE3;color-scheme:light}
html.pv-light body{background:#F3EDE3!important;color:#1A1A1A!important}
html.pv-light ::placeholder{color:#7a8494!important}
html.pv-light input,html.pv-light select,html.pv-light textarea{background:#fff!important;color:#1A1A1A!important;border-color:#D5CDBE!important}
html.pv-light option{background:#fff;color:#1A1A1A}
html.pv-light .qa-wrap,html.pv-light #qaFloat,html.pv-light #qaStatus,html.pv-light #qaCaption{color:revert}
'''
open('assets/portal-light.css', 'w').write(head + '\n'.join(rules) + '\n')
print(len(rules), 'rules')
