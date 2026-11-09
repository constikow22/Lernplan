#!/usr/bin/env python3
"""Build the Pages calendar from the Sunday plan and retain event revisions."""

import argparse
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
FIRST = date(2026, 11, 22)
LAST = date(2027, 4, 25)
DASHBOARD = "https://constikow22.github.io/Lernplan/lerngruppe/"
SUBJECTS = {"Strafrecht", "Öffentliches Recht"}
UNIT = r"(Strafrecht|Verwaltungsrecht|Staatsrecht):([1-9][0-9]*[a-z]?)"
ID = r"[a-z0-9][a-z0-9-]*"
STAMP = "%Y%m%dT%H%M%SZ"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def clean_text(value):
    return isinstance(value, str) and bool(value.strip()) and all(ord(ch) >= 32 and ord(ch) != 127 for ch in value)


def read_plan(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    require(set(data) == {"schemaVersion", "sessions"} and data["schemaVersion"] == 1,
            "Unbekanntes Format des Lerngruppenplans")
    sessions = data["sessions"]
    expected_dates = [(FIRST + timedelta(weeks=i)).isoformat()
                      for i in range((LAST - FIRST).days // 7 + 1)]
    require([s["date"] for s in sessions] == expected_dates,
            "Jeder Sonntag im Planungszeitraum muss genau einmal und chronologisch vorkommen")
    ids, uids, identities = set(), set(), set()
    for session in sessions:
        require(set(session) == {"id", "date", "uid", "subject", "cases"}, "Unbekannte Sitzungsfelder")
        key = session["id"]
        uid = session["uid"]
        require(re.fullmatch(ID, key) and key not in ids, f"Ungültige oder doppelte Sitzungs-ID: {key}")
        require(re.fullmatch(r"[A-Za-z0-9._-]+@[A-Za-z0-9.-]+", uid) and uid not in uids, f"Ungültige oder doppelte UID: {uid}")
        require(session["subject"] in SUBJECTS and session["cases"], f"Rechtsgebiet oder Fälle fehlen: {key}")
        ids.add(key)
        uids.add(uid)
        for case in session["cases"]:
            require(set(case) <= {"id", "status", "unitId", "slot", "authors", "reference", "title"},
                    "Unbekannte Fallfelder")
            cid = case["id"]
            match = re.fullmatch(UNIT, case["unitId"])
            require(re.fullmatch(ID, cid) and cid not in ids, f"Ungültige oder doppelte Fall-ID: {cid}")
            require(match and (match[1] == "Strafrecht") == (session["subject"] == "Strafrecht"),
                    f"Lerneinheit und Sitzungsfach passen nicht zusammen: {cid}")
            ids.add(cid)
            slot = case.get("slot")
            if slot is not None:
                require(type(slot) is int and slot > 0, f"Ungültige Fallposition: {cid}")
                identity = case["unitId"], slot
                require(identity not in identities, f"Doppelte Fallposition: {cid}")
                identities.add(identity)
            authors, reference = case["authors"], case["reference"]
            require(isinstance(authors, list) and all(clean_text(a) for a in authors), f"Ungültige Autoren: {cid}")
            if case["status"] == "placeholder":
                require(slot is not None and not authors and reference is None and "title" not in case,
                        f"Platzhalter mit fehlender Position oder mit unbelegter Fundstelle: {cid}")
            else:
                require(case["status"] == "confirmed" and authors and clean_text(reference),
                        f"Bestätigter Fall ohne Autoren oder Fundstelle: {cid}")
                if "title" in case:
                    require(clean_text(case["title"]), f"Ungültiger Titel: {cid}")
                identity = (case["unitId"], tuple(a.casefold() for a in authors), reference.casefold())
                require(identity not in identities, f"Doppelte Fundstelle innerhalb der Lerneinheit: {cid}")
                identities.add(identity)
    return sessions


def verify_retained(previous, current):
    for old, new in zip(previous, current, strict=True):
        require(all(old[k] == new[k] for k in ("id", "date", "uid", "subject")),
                f"Sitzung umgeplant: {old['id']}")
        cases = {c["id"]: c for c in new["cases"]}
        for case in old["cases"]:
            now = cases.get(case["id"])
            require(now is not None and now["unitId"] == case["unitId"] and now.get("slot") == case.get("slot"),
                    f"Fall-ID gelöscht, verschoben oder umgewidmet: {case['id']}")
            require(case["status"] != "confirmed" or now["status"] == "confirmed",
                    f"Bestätigter Fall wurde zum Platzhalter: {case['id']}")


def escape(value):
    return value.replace("\\", "\\\\").replace("\n", "\\n").replace(",", "\\,").replace(";", "\\;")


def fold(line):
    lines = [""]
    for char in line:
        if len((lines[-1] + char).encode("utf-8")) > 75:
            trimmed = lines[-1].rstrip(" ")
            whitespace = lines[-1][len(trimmed):]
            lines[-1] = trimmed
            lines.append(" " + whitespace)
        lines[-1] += char
    return "\r\n".join(lines)


def parse_calendar(raw):
    require(raw.endswith(b"\r\n") and not re.search(rb"(?<!\r)\n|\r(?!\n)", raw), "ICS benötigt CRLF-Zeilenenden")
    rows = re.sub(r"\r\n[ \t]", "", raw.decode("utf-8")).split("\r\n")
    require(rows[0] == "BEGIN:VCALENDAR" and rows[-2] == "END:VCALENDAR"
            and "VERSION:2.0" in rows and any(row.startswith("PRODID:") for row in rows),
            "Ungültiger VCALENDAR-Rahmen")
    events, event = {}, None
    for row in rows:
        if row == "BEGIN:VEVENT":
            require(event is None, "Verschachtelte VEVENTs")
            event = {}
        elif row == "END:VEVENT":
            require(event is not None, "VEVENT ohne Anfang")
            required = {"UID", "DTSTAMP", "DTSTART;VALUE=DATE", "DTEND;VALUE=DATE", "SUMMARY", "DESCRIPTION"}
            require(required <= event.keys() and event["UID"] not in events, "Unvollständiges oder doppeltes VEVENT")
            events[event["UID"]] = event
            event = None
        elif event is not None:
            key, value = row.split(":", 1)
            require(key not in event, f"Doppelte VEVENT-Eigenschaft: {key}")
            event[key] = value
    require(event is None, "Unvollständiges VEVENT")
    return events


def case_label(case):
    section, number = case["unitId"].split(":")
    if case["status"] == "placeholder":
        return f"{section} LE {number} – Fall {case['slot']} [Platzhalter]"
    label = f"{'/'.join(case['authors'])}, {case['reference']}"
    return label + (f" – {case['title']}" if case.get("title") else "")


def make_event(session):
    count = len(session["cases"])
    subject = session["subject"]
    day = date.fromisoformat(session["date"])
    units = dict.fromkeys(c["unitId"].replace(":", " LE ") for c in session["cases"])
    cases = "\n".join(f"{i}. {case_label(c)}" for i, c in enumerate(session["cases"], 1))
    description = f"Rep²plus – Lerngruppe\n\nRechtsgebiet: {subject}\n\nLerneinheiten: {', '.join(units)}\n\nZu besprechende Fälle:\n\n{cases}\n\nLernplan: {DASHBOARD}"
    return {
        "UID": session["uid"],
        "DTSTART;VALUE=DATE": day.strftime("%Y%m%d"),
        "DTEND;VALUE=DATE": (day + timedelta(days=1)).strftime("%Y%m%d"),
        "SUMMARY": escape(f"68 | {subject} – {count} {'Fall' if count == 1 else 'Fälle'}"),
        "DESCRIPTION": escape(description),
        "CATEGORIES": escape(subject),
        "URL": DASHBOARD,
        "TRANSP": "TRANSPARENT",
    }


def generate(sessions, previous, stamp):
    rows = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Rep2plus//Lerngruppe 68//DE",
            "CALSCALE:GREGORIAN", "X-WR-CALNAME:Rep²plus 68 – Lerngruppe"]
    by_date = {event["DTSTART;VALUE=DATE"]: uid for uid, event in previous.items()}
    expected = {}
    for session in sessions:
        event = make_event(session)
        uid = event["UID"]
        old = previous.get(uid)
        day = event["DTSTART;VALUE=DATE"]
        require(by_date.get(day, uid) == uid and (not old or old["DTSTART;VALUE=DATE"] == day),
                f"Bestehender Termin oder UID wurde geändert: {uid}")
        sequence = int(old.get("SEQUENCE", 0)) if old else 0
        require(sequence >= 0, f"Ungültige SEQUENCE: {uid}")
        if old and all(old.get(key) == value for key, value in event.items()):
            event.update(DTSTAMP=old["DTSTAMP"], SEQUENCE=str(sequence),
                         **{"LAST-MODIFIED": old.get("LAST-MODIFIED", old["DTSTAMP"])})
        else:
            # A second edit in the same second still gets a distinct revision.
            new_stamp = stamp
            if old:
                last = datetime.strptime(old.get("LAST-MODIFIED", old["DTSTAMP"]), STAMP)
                new_stamp = max(stamp, (last + timedelta(seconds=1)).strftime(STAMP))
            event.update(DTSTAMP=new_stamp, SEQUENCE=str(sequence + bool(old)), **{"LAST-MODIFIED": new_stamp})
        expected[uid] = event
        rows.extend(["BEGIN:VEVENT", *(f"{key}:{value}" for key, value in event.items()), "END:VEVENT"])
    rows.append("END:VCALENDAR")
    raw = ("\r\n".join(fold(row) for row in rows) + "\r\n").encode("utf-8")
    require(all(len(line) <= 75 for line in raw.split(b"\r\n")), "Zu lange ICS-Zeile")
    require(parse_calendar(raw) == expected, "ICS lässt sich nicht verlustfrei einlesen")
    for event in expected.values():
        datetime.strptime(event["DTSTAMP"], STAMP)
        datetime.strptime(event["LAST-MODIFIED"], STAMP)
    return raw


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=ROOT / "data/lerngruppenplan.json")
    parser.add_argument("--output", type=Path, default=ROOT / "calendar/lerngruppe.ics")
    parser.add_argument("--baseline", type=Path, help="Vorherige JSON-Datei für den ID- und Terminvergleich")
    parser.add_argument("--check", action="store_true", help="Abgleich mit dem Kalender ohne Schreibzugriff")
    args = parser.parse_args()
    try:
        sessions = read_plan(args.data)
        if args.baseline:
            verify_retained(read_plan(args.baseline), sessions)
        old = args.output.read_bytes() if args.output.exists() else b""
        data = generate(sessions, parse_calendar(old) if old else {}, datetime.now(timezone.utc).strftime(STAMP))
        if args.check:
            require(old == data, "Kalender ist veraltet. Erneut ohne --check ausführen.")
        elif old != data:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            temporary = args.output.with_suffix(".ics.tmp")
            temporary.write_bytes(data)
            temporary.replace(args.output)
        print(f"Gültig: {len(sessions)} Sonntage, {sum(len(s['cases']) for s in sessions)} Fälle.")
    except (OSError, ValueError, TypeError, KeyError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
