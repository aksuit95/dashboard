"""Generate a compact Korean PDF from the exact saved briefing snapshot."""
import json, sys
from datetime import datetime
from zoneinfo import ZoneInfo
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, PageBreak
from xml.sax.saxutils import escape

data=json.load(open(sys.argv[1], encoding='utf-8'))
pdfmetrics.registerFont(TTFont('Malgun',r'C:\Windows\Fonts\malgun.ttf'))
pdfmetrics.registerFont(TTFont('MalgunBold',r'C:\Windows\Fonts\malgunbd.ttf'))
pdfmetrics.registerFontFamily('Malgun', normal='Malgun', bold='MalgunBold')
styles=getSampleStyleSheet()
body=ParagraphStyle('ko',fontName='Malgun',fontSize=8,leading=12,textColor=colors.HexColor('#24333e'))
title=ParagraphStyle('titleko',parent=body,fontName='MalgunBold',fontSize=19,leading=25,spaceAfter=6)
small=ParagraphStyle('smallko',parent=body,fontSize=7,leading=10,textColor=colors.HexColor('#61717c'))
heading=ParagraphStyle('headko',parent=body,fontName='MalgunBold',fontSize=12,leading=17,spaceBefore=12,spaceAfter=5)
def para(x, style=body): return Paragraph(escape(str(x)),style)
def stamp(s):
    return datetime.fromisoformat(s.replace('Z','+00:00')).astimezone(ZoneInfo('Asia/Seoul')).strftime('%Y-%m-%d %H:%M KST') if s else '확인 불가'
def signed(v,d=2,suffix=''):
    if v is None: return para('결측')
    color='#b91c1c' if v>0 else '#1d4ed8' if v<0 else '#52525b'
    return Paragraph(f'<font color="{color}">{v:+,.{d}f}{suffix}</font>',body)
def table(rows,widths=None):
    t=Table(rows,colWidths=widths,repeatRows=1,hAlign='LEFT')
    t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('FONTNAME',(0,0),(-1,-1),'Malgun'),('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),('LINEBELOW',(0,0),(-1,0),0.4,colors.HexColor('#cbd5d8'))]))
    return t
flow=[]
p=data['period']; weekly=data['type']=='weekly'
flow += [para('MK RESEARCH  /  MARKET BRIEFING',small),para(('주간' if weekly else '일간')+' 시장 브리핑',title),para((f"주간 {p['start']} ~ {p['weekEnd']} · 실제 거래일 {p['days'][0]} ~ {p['end']}" if weekly else f"기준일 {p['end']}")+f" · 비교 {p['base']}",small),para('국내 가격: KRX 정규장 15:30 KST · 작성 '+stamp(data['createdAt']),small)]
flow += [para('01 시장 요약',heading),para('출처: KRX 정보데이터시스템 · 비교일과 기준일 모두 KRX 종가',small)]
rows=[[para('시장'),para('종가'),para('등락'),para('등락률'),para('수집 시각')]]
for x in data['indices']: rows.append([para('코스피' if x['id']=='kospi' else '코스닥'),para(f"{x['close']:,.2f}" if x['close'] is not None else '결측'),signed(x['change']),signed(x['percent'],suffix='%'),para(stamp(x['fetchedAt']),small)])
flow.append(table(rows,[55,80,80,72,190]))
flow += [para('02 섹터 흐름',heading),para('구성종목 동일가중 평균 · 공식 섹터 지수 아님 · 현재 구성과 분류를 과거에 적용',small)]
for s in data['sectors']:
    name='코스피200' if s['universe']=='kospi200' else '코스닥150'
    flow.append(para(name+' · 기준 '+p['end']+' · 수집 '+stamp(s['fetchedAt']),small))
    if s['error']: flow.append(para('결측: '+s['error'])); continue
    rows=[[para('상위 3'),para('등락률'),para('하위 3'),para('등락률')]]
    top=s['rows'][:3]; bottom=list(reversed(s['rows'][-3:]))
    for i in range(max(len(top),len(bottom))):
        a=top[i] if i<len(top) else None; b=bottom[i] if i<len(bottom) else None
        rows.append([para(a['name'] if a else '-'),signed(a['value'] if a else None,suffix='%'),para(b['name'] if b else '-'),signed(b['value'] if b else None,suffix='%')])
    flow.append(table(rows,[160,75,160,75]))
    if s.get('hasMissing'): flow.append(para('일부 구성종목 가격 결측',small))
flow += [para('03 상승 · 하락 종목',heading),para('코스피200 · 코스닥150 구성종목 기준 / 시장 전체 집계 아님',small)]
for s in data['sectors']:
    m=s.get('movers'); flow.append(para('코스피200' if s['universe']=='kospi200' else '코스닥150'))
    if not m: flow.append(para('결측: '+str(s.get('error') or '종목 자료 없음'),small)); continue
    flow.append(para(f"상승 {m['up']} · 하락 {m['down']} · 보합 {m['flat']} · 결측 {m['missing']} / 전체 {m['total']}종목",small))
    rows=[[para('상승 상위'),para('등락률'),para('하락 상위'),para('등락률')]]
    for i in range(max(len(m['leaders']),len(m['laggards']))):
        a=m['leaders'][i] if i<len(m['leaders']) else None; b=m['laggards'][i] if i<len(m['laggards']) else None
        rows.append([para(a['name'] if a else '-'),signed(a['value'] if a else None,suffix='%'),para(b['name'] if b else '-'),signed(b['value'] if b else None,suffix='%')])
    flow.append(table(rows,[160,75,160,75]))
if weekly: flow.append(PageBreak())
flow += [para('04 투자자 수급',heading),para('토스증권 시장 전체 · 단위 억 원 · 매수 - 매도 · KRX와 NXT 합산으로 가격과 거래 범위가 다릅니다.',small)]
for f in data['flows']:
    items=[para(('코스피' if f['universe']=='kospi200' else '코스닥')+' · 원본 갱신 '+stamp(f['updatedAt'])+' · 수집 '+stamp(f['collectedAt']),small)]
    if not f['points']:
        items.append(para('결측: '+str(f.get('error') or '수급 자료 없음'))); flow.append(KeepTogether(items)); continue
    rows=[[para('거래일'),para('개인'),para('외국인'),para('기관')]]
    for x in f['points']: rows.append([para(x['date'])]+[signed(x[k]/1e8 if x[k] is not None else None,0) for k in ('individual','foreign','institution')])
    if weekly: rows.append([para('주간 합계')]+[signed(None if f['missing'] else sum(x[k] for x in f['points'])/1e8,0) for k in ('individual','foreign','institution')])
    items.append(table(rows,[130,110,110,110]))
    if f['missing']: items.append(para('결측 거래일: '+', '.join(f['missing']),small))
    flow.append(KeepTogether(items))
flow += [Spacer(1,10),para('정보 제공 및 개인 리서치용이며 투자 권유나 매매 신호가 아닙니다.',small)]
def page(canvas,doc):
    canvas.setFont('Malgun',7); canvas.setFillColor(colors.HexColor('#61717c')); canvas.drawRightString(A4[0]-17*mm,11*mm,str(doc.page))
SimpleDocTemplate(sys.argv[2],pagesize=A4,leftMargin=17*mm,rightMargin=17*mm,topMargin=15*mm,bottomMargin=16*mm,title='시장 브리핑').build(flow,onFirstPage=page,onLaterPages=page)
