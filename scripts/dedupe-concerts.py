#!/usr/bin/env python3
"""
二重登録された公演の統合（2026-10 LiveFans 自動取り込みの重複判定漏れの後始末）

対象: 同アーティスト・同日・同会場・同ツアー/フェス・同ステージ・同開演時刻 の公演が2件あり、
      「片方だけ LiveFans event_id を持つ」組（= 手動登録 + 自動取り込みの二重登録）
      ※ 両方に別々の event_id がある組・両方ない組は別公演の可能性があるので触らない

処理: 古い方（手動登録・URLが先に公開されている方）を残し、新しい方のデータを移してから削除
  - livefans_event_id / start_time を残す方へ移す
  - セトリ投稿: 残す方に同じユーザーの投稿がなければ移動、あれば重複として削除（曲・投票も）
  - setlist_songs（投稿に紐付かないもの）・concert_artists も移動
  - 実行前に対象データを JSON でバックアップ

  --loose: 開演時刻が片方だけ空・会場名の表記ゆれ（「Tacoma Dome (アメリカ)」/「Tacoma Dome」等）も対象にする
          （同アーティスト・同日・同ツアー/フェス・同ステージで、片方だけ event_id を持つ2件）

usage:
  python3 scripts/dedupe-concerts.py                    # ドライラン（何も変更しない）
  python3 scripts/dedupe-concerts.py --execute          # 実行
  python3 scripts/dedupe-concerts.py --loose [--execute]
"""
import collections
import json
import os
import sys
from datetime import datetime
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
env = {}
for line in (ROOT / '.env.local').read_text().splitlines():
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip().strip('"')
U = env['NEXT_PUBLIC_SUPABASE_URL']
K = env['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': K, 'Authorization': f'Bearer {K}', 'Content-Type': 'application/json'}
EXECUTE = '--execute' in sys.argv
LOOSE = '--loose' in sys.argv


def get_all(path):
    rows, o = [], 0
    while True:
        sep = '&' if '?' in path else '?'
        r = requests.get(f'{U}/rest/v1/{path}{sep}offset={o}&limit=1000', headers=H)
        r.raise_for_status()
        d = r.json()
        rows += d
        if len(d) < 1000:
            return rows
        o += 1000


def get_in(table, col, ids, select='*'):
    out = []
    for i in range(0, len(ids), 100):
        chunk = ids[i:i + 100]
        out += get_all(f'{table}?select={select}&{col}=in.({",".join(chunk)})')
    return out


def patch(table, filt, body):
    if not EXECUTE:
        return
    r = requests.patch(f'{U}/rest/v1/{table}?{filt}', headers=H, json=body)
    r.raise_for_status()


def delete(table, filt):
    if not EXECUTE:
        return
    r = requests.delete(f'{U}/rest/v1/{table}?{filt}', headers=H)
    r.raise_for_status()


concerts = get_all('concerts?select=id,artist_id,tour_id,festival_event_id,date,start_time,venue_name,stage_name,livefans_event_id,created_at&order=id')
groups = collections.defaultdict(list)
for c in concerts:
    if LOOSE:
        groups[(c['artist_id'], c['date'], c['tour_id'], c['festival_event_id'], c['stage_name'])].append(c)
    else:
        groups[(c['artist_id'], c['date'], c['venue_name'].strip(), c['tour_id'], c['festival_event_id'], c['stage_name'], c['start_time'])].append(c)

pairs = []  # (keep, dup)
for v in groups.values():
    if len(v) != 2:
        continue
    with_lf = [c for c in v if c['livefans_event_id']]
    if len(with_lf) != 1:
        continue
    if LOOSE:
        a, b = v
        # 開演時刻が違う（両方設定あり）なら昼夜2回公演の可能性があるので対象外
        if a['start_time'] and b['start_time'] and a['start_time'] != b['start_time']:
            continue
    keep, dup = sorted(v, key=lambda c: c['created_at'])
    pairs.append((keep, dup))

print(f'対象: {len(pairs)}組（削除する公演 {len(pairs)}件）')
if not pairs:
    sys.exit(0)

dup_ids = [d['id'] for _, d in pairs]
keep_ids = [k['id'] for k, _ in pairs]
subs_dup = get_in('setlist_submissions', 'concert_id', dup_ids)
subs_keep = get_in('setlist_submissions', 'concert_id', keep_ids, 'id,concert_id,user_id')
songs_dup = get_in('setlist_songs', 'concert_id', dup_ids)
ca_dup = get_in('concert_artists', 'concert_id', dup_ids)
ca_keep = get_in('concert_artists', 'concert_id', keep_ids, 'concert_id,artist_id')
sub_ids_dup = [s['id'] for s in subs_dup]
votes_dup = get_in('setlist_submission_votes', 'submission_id', sub_ids_dup) if sub_ids_dup else []

backup = {
    'created_at': datetime.now().isoformat(),
    'pairs': [{'keep': k, 'dup': d} for k, d in pairs],
    'setlist_submissions': subs_dup,
    'setlist_songs': songs_dup,
    'concert_artists': ca_dup,
    'setlist_submission_votes': votes_dup,
}
backup_dir = ROOT.parent / 'backups'
backup_dir.mkdir(exist_ok=True)
backup_path = backup_dir / f'concert-dedupe{"-loose" if LOOSE else ""}-{datetime.now():%Y%m%d-%H%M%S}{"" if EXECUTE else "-dryrun"}.json'
backup_path.write_text(json.dumps(backup, ensure_ascii=False, indent=1))
print(f'バックアップ: {backup_path}')

keep_users = collections.defaultdict(set)
for s in subs_keep:
    keep_users[s['concert_id']].add(s['user_id'])
keep_ca = {(c['concert_id'], c['artist_id']) for c in ca_keep}
subs_by_dup = collections.defaultdict(list)
for s in subs_dup:
    subs_by_dup[s['concert_id']].append(s)
ca_by_dup = collections.defaultdict(list)
for c in ca_dup:
    ca_by_dup[c['concert_id']].append(c)

stats = collections.Counter()
for keep, dup in pairs:
    # 1) LiveFans event_id・開演時刻を残す方へ（ユニーク制約に備えて先に外す）
    patch('concerts', f'id=eq.{dup["id"]}', {'livefans_event_id': None})
    body = {'livefans_event_id': dup['livefans_event_id']}
    if not keep['start_time'] and dup['start_time']:
        body['start_time'] = dup['start_time']
    if not keep['tour_id'] and dup['tour_id']:
        body['tour_id'] = dup['tour_id']
    patch('concerts', f'id=eq.{keep["id"]}', body)

    # 2) セトリ投稿
    for s in subs_by_dup[dup['id']]:
        if s['user_id'] in keep_users[keep['id']]:
            delete('setlist_submission_votes', f'submission_id=eq.{s["id"]}')
            delete('setlist_songs', f'submission_id=eq.{s["id"]}')
            delete('setlist_submissions', f'id=eq.{s["id"]}')
            stats['セトリ投稿 重複のため削除'] += 1
        else:
            patch('setlist_submissions', f'id=eq.{s["id"]}', {'concert_id': keep['id']})
            patch('setlist_songs', f'submission_id=eq.{s["id"]}', {'concert_id': keep['id']})
            keep_users[keep['id']].add(s['user_id'])
            stats['セトリ投稿 移動'] += 1
    # 投稿に紐付かない曲
    patch('setlist_songs', f'concert_id=eq.{dup["id"]}', {'concert_id': keep['id']})

    # 3) 共演者
    for c in ca_by_dup[dup['id']]:
        if (keep['id'], c['artist_id']) in keep_ca:
            delete('concert_artists', f'concert_id=eq.{dup["id"]}&artist_id=eq.{c["artist_id"]}')
        else:
            patch('concert_artists', f'concert_id=eq.{dup["id"]}&artist_id=eq.{c["artist_id"]}', {'concert_id': keep['id']})
            stats['共演者 移動'] += 1

    # 4) 重複側の公演を削除
    delete('concerts', f'id=eq.{dup["id"]}')
    stats['公演 削除'] += 1

print(('実行しました' if EXECUTE else 'ドライラン（変更なし）') + ':', dict(stats))
