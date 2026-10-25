"""Compile reviewed factual research JSON to a static, dependency-free module.

Usage: python3 scripts/build-catalog.py --jobs /path/job-catalog.json
                                     --shared /path/catalog.json
Downloaded JavaScript is never executed. Do not include source application code.
"""
import argparse
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--jobs', required=True)
parser.add_argument('--shared', required=True)
args = parser.parse_args()
jobs_data = json.loads(Path(args.jobs).read_text())
shared_data = json.loads(Path(args.shared).read_text())
jobs = jobs_data['jobs']
for job in jobs:
    for e in job['skills']:
        if e.get('condition'):
            e['condition'] = re.sub(r'\s*\(자료 ID \d+\)', '', e['condition'])
        for f in e['facts']:
            f['label'] = f['label'].replace('GiveDamagePower1', '해당 스킬 피해 보정')
        if not e['facts'] and not e['effectModel'] and not e.get('unresolved'):
            e['recordOnly'] = True
        # A movement/attack-speed buff has no direct effect on one-hit damage.
        if e['name'] == '민첩한 몸놀림':
            e['recordOnly'] = True
            e['unresolved'] = None
        if e.get('requiresMasteryId'):
            prior = next((x for x in job['skills'] if x['id'] == e['requiresMasteryId']), None)
            if prior:
                e['condition'] = '선행 연구: ' + prior['name'] + '. 실제 연구 완료를 직접 확인하세요.'

sources = {}
for key, value in shared_data['sources'].items():
    sources[key] = {'label': value['title'], 'url': value['url'], 'official': True,
                    'date': value.get('date', '문서 기준일 미확인')}
sources['guide']['note'] = '한국 공식 가이드. Global은 영문 가이드를 우선 확인하세요.'
sources.update({
    'index115': {'label': 'MapleIdleIndex 직업·스킬 표', 'url': 'https://mapleidleindex.com/skills/',
                 'official': False, 'date': '클라이언트 1.15.0',
                 'note': '추출된 수치·해금 표. Global PC 1.17.0 전체 감사 전; 툴팁 확인 필요'},
    'globalGuide': {'label': 'Global 공식 전투 가이드', 'url': 'https://maplestoryidle.nexon.com/en/guide',
                    'official': True, 'date': '2026-09-22 표시'},
    'appStoreUS': {'label': '미국 App Store · 앱 버전', 'url': 'https://apps.apple.com/us/app/maplestory-idle-rpg/id6739616715',
                   'official': True, 'date': '2026-10-25 확인 · iOS 1.17.1'},
    'appStoreKR': {'label': '한국 App Store · 동일 앱 ID', 'url': 'https://apps.apple.com/kr/app/id6739616715',
                   'official': True, 'date': '2026-10-25 확인 · iOS 1.17.1'},
})

labels = {'finalDamage':'최종 데미지', 'damage':'데미지', 'boss':'보스 몬스터 데미지',
          'critDamage':'크리티컬 데미지', 'critChance':'크리티컬 확률', 'basic':'기본 공격 데미지',
          'skill':'스킬 데미지', 'attackPercent':'공격력', 'mainStat':'주스탯',
          'penetration':'방어 관통력', 'cooldown':'재사용 대기시간 감소', 'attackSpeed':'공격 속도'}
supported = {'finalDamage','damage','boss','normal','critDamage','critChance','basic','skill',
             'attackPercent','penetration','minDamage','maxDamage','amplification','attack','statDamage','statusDamage'}
shared = []
for raw in shared_data['entries']:
    if raw['id'] == 'pet-collection':
        continue  # Existence and the full current table were not verified.
    original = raw.get('effects', [])
    verified = raw.get('globalVerification')
    category = ('guild' if raw['category']=='길드' else
                'cash' if raw['category'].startswith('캐시') else
                'consumable' if raw['category'] in ['이벤트·소비','종료 이벤트'] else
                'collection' if raw['category'] in ['훈장 보유','유물','코스튬','기타 보유'] else 'growth')
    kind = 'passive' if raw['kind'] in ['passive','timed-passive'] else 'info' if raw['kind']=='expired' else 'buff'
    facts = [f"{labels.get(v['type'],v['type'])} +{v['value']}{'' if v['type']=='mainStat' else '%'}" for v in original]
    description = ' · '.join(facts + [str(v) for v in [raw.get('benefits'),raw.get('otherEffects')] if v])
    e = {'id':raw['id'], 'name':raw['name'], 'category':category, 'kind':kind,
         'combat':raw.get('combat',True), 'maxRank':1,
         'sourceIds':list(dict.fromkeys(([verified['source']] if verified else [])+[raw['source']])),
         'regions':['global','kr'] if verified else ['kr'],
         'dataDate':sources[raw['source']]['date'], 'description':description or '현행 전체 수치표는 미확보 상태입니다. 게임에서 확인한 수치를 직접 입력하세요.',
         'condition':raw.get('condition',''), 'note':raw.get('note','')}
    if verified and verified.get('name') and verified['name'] not in e['name']:
        e['name'] += ' / ' + verified['name']
    effects = [v for v in original if v['type'] in supported]
    unresolved = ''
    if e['combat'] and (not original or any(v['type'] not in supported for v in original)):
        unresolved = '수치 전체 확인 또는 원시 스탯 환산이 필요합니다.'
    if original and all(v['type'] in ['cooldown','attackSpeed'] for v in original):
        e['recordOnly']=True
        unresolved=''
    if raw['id'].startswith('companion-') and original:
        unresolved='동료 스킬의 대상·발동 조건과 스킬 공격력 배율을 직접 확인하세요.'
        effects=[]
    if raw['status']=='expired':
        e['combat']=False
        e['note']='현재 종료된 효과입니다. 활성 버프로 사용할 수 없습니다.'
    if raw.get('caps'):
        e['note']+=' · 보유 합계의 상한: '+', '.join(f'{labels.get(k,k)} {v}' for k,v in raw['caps'].items())+' (실제 보유 수치가 아님)'
    if raw['id'].startswith('halloween-'):
        e['contexts']=['chapterIdle']
    if raw['id']=='relic-zakum-equip':e['contexts']=['zakum']
    if raw['id']=='relic-horntail-equip':e['contexts']=['horntail']
    if raw['id']=='guild-systems':
        e['name']='길드 패시브 · 개인별 적용 합계'
        e['description']='길드에서 실제 적용 중인 스탯 변화량을 직접 등록합니다. 전체 스킬명·연구 레벨별 표는 아직 확보하지 못했습니다.'
    if raw['id'] in ['membership-special','membership-premium']:
        e['note']='확인된 성장·편의 혜택입니다. 지급 의상의 주스탯 보유 효과는 별도 카드에서 등록하세요. 상품 전체 혜택의 최신 감사는 미완료입니다.'
    e['ranks']=[{'level':1,'description':e['description'],'effects':effects,'unresolved':unresolved}]
    if raw['id']=='relic-spear-equip':
        e['maxRank']=3
        e['variants']=[[1,'적 2명 이상'],[2,'적 1명 · 일반'],[3,'적 1명 · 보스']]
        e['ranks']=[{'level':i,'description':f'공격력 +5% · 방관 +{v}% · {e["variants"][i-1][1]}',
                     'effects':[{'type':'attackPercent','value':5},{'type':'penetration','value':v}], 'unresolved':''}
                    for i,v in enumerate([5,10,15],1)]
    if raw['id']=='relic-map-equip':
        e['maxRank']=3
        e['variants']=[[1,'적 10명 미만'],[2,'적 10명 이상'],[3,'성장 던전 · 원문 조건 확인']]
        e['ranks']=[{'level':i,'description':f'공격력 +5% · 추가 최종 데미지 {v}%',
                     'effects':[{'type':'attackPercent','value':5}]+([{'type':'finalDamage','value':v}] if v else []),
                     'unresolved':'성장 던전과 대상 수의 결합 조건을 확인해 직접 입력하세요.' if i==3 else ''}
                    for i,v in enumerate([0,5,15],1)]
    if raw['id']=='relic-ring-equip':
        e['maxRank']=12
        e['variants']=[[1,'자체 효과 제거 후 크확 <100%']]+[[i+2,f'크확 ≥{100+i*10}% · 초과 중첩 {i}'] for i in range(11)]
        e['ranks']=[{'level':1,'description':'자체 효과를 뺀 크확이 100% 미만: 크확 +30%',
                     'effects':[{'type':'critChance','value':30}], 'unresolved':''}]+[
                    {'level':i+2,'description':f'스킬 데미지 +40% · 기본 공격 데미지 +{i*6}%',
                     'effects':[{'type':'skill','value':40}]+([{'type':'basic','value':i*6}] if i else []), 'unresolved':''} for i in range(11)]
        e['condition']='5초마다 자체 효과를 제거하고 크확을 다시 판정합니다. 아래 조건을 직접 선택하세요. 스킬 데미지 분기와 크확 분기를 함께 적용하지 않습니다.'
        e['note']='자체 효과를 뺀 크리티컬 확률을 기준으로 조건을 선택하세요.'
    if raw['id']=='relic-spear-equip':e['note']='공격력 %는 내 스펙의 실측 환산값을 입력해야 계산할 수 있습니다.'
    if raw['id']=='relic-map-equip':e['note']='성장 던전의 대상 수 조건은 확인이 필요해 해당 분기의 자동 계산을 제한합니다.'
    shared.append(e)

coverage=[
 {'name':'직업 스킬','status':'14직업 · 기본 434개. 1.15.0 보조 표의 해금·수치; 전체 1.17.0 검증 전'},
 {'name':'마스터리','status':'812개 연구 정보. 해금·선행·시간·재화 조회 및 연구 완료 기록; 효과 자동 합성 전'},
 {'name':'길드 스킬·패시브','status':'노블레스 데미지 증가 확인. 현행 전체 레벨별 수치 미확보 → 직접 등록'},
 {'name':'캐시·회원권','status':'Global 회원권·지급 투명 의상·광고 제거 확인. 전체 상점·기간제 상품 전수 조사 전'},
 {'name':'유물·훈장·이벤트','status':'공식 패치의 일부 효과. Global 확인 여부와 콘텐츠 조건 구분'},
 {'name':'기타 보유·수집','status':'코스튬 상한·기간제 보상 일부. 모든 개별 코스튬·보유 아이템 표 미확보'},
 {'name':'Global / KR 차이','status':'미국·한국 iOS는 동일 앱 ID·1.17.1. 사용자 PC는 1.17.0; 공지의 일부 조건 문구 불일치'},
]
out={'JOBS':jobs,'SHARED':shared,'CURVES':jobs_data['curves'],'SOURCES':sources,'COVERAGE':coverage,'CATALOG_DATE':'2026.10.25'}
root=Path(__file__).resolve().parents[1]
(root/'dist/catalog-data.mjs').write_text('// Reviewed numerical facts; see docs/CATALOG.md for provenance and limitations.\n'+ '\n'.join('export const '+k+' = '+json.dumps(v,ensure_ascii=False,separators=(',',':'))+';' for k,v in out.items())+'\n')
print(json.dumps({'jobs':len(jobs),'skills':sum(e['kind']!='mastery' for j in jobs for e in j['skills']),
                  'masteries':sum(e['kind']=='mastery' for j in jobs for e in j['skills']),'shared':len(shared),
                  'globalVerified':sum(bool(e.get('globalVerification')) for e in shared_data['entries'])}))
