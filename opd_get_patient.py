#!/usr/bin/python
# -*- coding: utf-8 -*-
"""
Created on Tue Jan 20 14:10:00 2015

@author: joschi
"""
from __future__ import print_function
import time as time_lib
from datetime import datetime, timedelta
import os
import sys
import csv
#import simplejson as json
import json

input_format = {
    "patient_id": 'DESYNPUF_ID',
    "born": 'BENE_BIRTH_DT',
    "gender": 'BENE_SEX_IDENT_CD',
    "claim_from": 'CLM_FROM_DT',
    "claim_to": 'CLM_THRU_DT',
    "diagnosis": ['ICD9_DGNS_CD_' + str(n) for n in xrange(1, 11)],
    "procedures": ['ICD9_PRCDR_CD_' + str(n) for n in xrange(1, 7)],
    # TODO HCPCS_CD_1 – HCPCS_CD_45: DESYNPUF: Revenue Center HCFA Common Procedure Coding System
    "prescribed_date": 'SRVC_DT',
    "prescribed": 'PROD_SRVC_ID'
    #"lab_date": ''
    #"lab_code": ''
    #"lab_result": ''
    #"lab_flag": ''
}

TYPE_PRESCRIBED = "prescribed"
TYPE_LABTEST    = "lab-test"
TYPE_DIAGNOSIS  = "diagnosis"
TYPE_PROCEDURE  = "procedure"

MODE_OPTIONAL = 0
MODE_DEFAULT = 1
MODE_ARRAY = 2

gender_label = {
    1: "primary",
    2: "danger"
}
gender_map = {
    1: "M",
    2: "W"
}

def toTime(s):
    return int(time_lib.mktime(datetime.strptime(s, "%Y%m%d").timetuple()))

def nextDay(stamp):
    return int(time_lib.mktime((datetime.fromtimestamp(stamp) + timedelta(days = 1)).timetuple()))

def addInfo(obj, id, key, value, hasLabel = False, label = ""):
    for info in obj["info"]:
        if info["id"] == id:
            print('duplicate "'+id+'" new: '+str(value)+' old: '+str(info["value"]), file=sys.stderr)
            return
    node = {
        "id": id,
        "name": key,
        "value": value,
    }
    if hasLabel:
        node["label"] = label
    obj["info"].append(node)

def handleKey(row, key, mode, hnd):
    if mode == MODE_ARRAY:
        for k in input_format[key]:
            if k in row:
                hnd(row[k])
        return
    ignore_missing = mode == MODE_DEFAULT
    if key in input_format:
        k = input_format[key]
        if k in row:
            hnd(row[k])
    elif ignore_missing:
        hnd('')

def createEntry(group, id, hasResult = False, resultFlag = False, result = ""):
    res = {
        "id": id,
        "group": group
    }
    if hasResult:
        res["flag_value"] = result
        res["flag"] = resultFlag
    return res

def handleEvent(row):
    res = []
    def emit(type, value):
        if value != '':
            res.append(createEntry(type, value))

    handleKey(row, "diagnosis", MODE_ARRAY, lambda value: emit(TYPE_DIAGNOSIS, value))
    handleKey(row, "procedures", MODE_ARRAY, lambda value: emit(TYPE_PROCEDURE, value))
    return res

def handleRow(row, obj):
    handleKey(row, "born", MODE_OPTIONAL, lambda value:
            addInfo(obj, 'born', 'Born', int(str(value)[0:4]))
        )
    handleKey(row, "gender", MODE_OPTIONAL, lambda value:
            addInfo(obj, 'gender', 'Gender', gender_map.get(value, 'U'), True, gender_label.get(value, "default"))
        )

    def dates(fromDate, toDate):
        if fromDate == '':
            if toDate == '':
                return
            fromDate = toDate
            toDate = ''
        curDate = toTime(fromDate)
        if toDate != '':
            # time span
            endDate = toTime(toDate)
            while curDate <= endDate:
                for event in handleEvent(row):
                    event['time'] = curDate
                    obj['events'].append(event)
                curDate = nextDay(curDate)
        else:
            # single event
            for event in handleEvent(row):
                event['time'] = curDate
                obj['events'].append(event)

    handleKey(row, "claim_from", MODE_OPTIONAL, lambda fromDate:
            handleKey(row, "claim_to", MODE_DEFAULT, lambda toDate:
                dates(fromDate, toDate)
            )
        )

    def emitNDC(date, ndc):
        event = createEntry(TYPE_PRESCRIBED, ndc)
        event['time'] = toTime(date)
        obj['events'].append(event)

    handleKey(row, "prescribed_date", MODE_OPTIONAL, lambda date:
            handleKey(row, "prescribed", MODE_OPTIONAL, lambda ndc:
                emitNDC(date, ndc)
            )
        )

    def emitLab(date, loinc, result, resultFlag):
        event = createEntry(TYPE_LABTEST, loinc, result != '' or resultFlag != '', resultFlag, result)
        event['time'] = toTime(date)
        obj['events'].append(event)

    handleKey(row, "lab_date", MODE_OPTIONAL, lambda date:
            handleKey(row, "lab_code", MODE_OPTIONAL, lambda loinc:
                handleKey(row, "lab_result", MODE_DEFAULT, lambda result:
                    handleKey(row, "lab_flag", MODE_DEFAULT, lambda flag:
                        emitLab(date, loinc, result, flag)
                    )
                )
            )
        )

def processFile(inputFile, id, obj):
    with open(inputFile) as csvFile:
        reader = csv.DictReader(csvFile)
        for row in reader:
            if id == row[input_format["patient_id"]]:
                handleRow(row, obj)

def processDirectory(dir, id, obj):
    for (_, _, files) in os.walk(dir):
        for file in files:
            if file.endswith(".csv"):
                processFile(dir + '/' + file, id, obj)

def usage():
    print('usage: {} [-h] [-o <output>] -p <id> -- <file or path>...'.format(sys.argv[0]), file=sys.stderr)
    print('-h: print help', file=sys.stderr)
    print('-o <output>: specifies output file. stdout if omitted or "-"', file=sys.stderr)
    print('-p <id>: specifies the patient id', file=sys.stderr)
    print('<file or path>: a list of input files or paths containing them', file=sys.stderr)
    exit(1)

if __name__ == '__main__':
    id = None
    output = '-'
    args = sys.argv[:]
    args.pop(0)
    while args:
        arg = args.pop(0)
        if arg == '--':
            break
        if arg == '-h':
            usage()
        if arg == '-o':
            if not args:
                print('-o requires output file', file=sys.stderr)
                usage()
            output = args.pop(0)
            if output == '--':
                print('-o requires output file', file=sys.stderr)
                usage()
        elif arg == '-p':
            if not args:
                print('no id specified', file=sys.stderr)
                usage()
            id = args.pop(0)
            if id == '--':
                print('no id specified', file=sys.stderr)
                usage()
        else:
            print('unrecognized argument: ' + arg, file=sys.stderr)
            usage()
    if id is None:
        print('need to specify id with -p', file=sys.stderr)
        usage()
    allPaths = []
    while args:
        path = args.pop(0)
        if os.path.isfile(path):
            allPaths.append((path, True))
        elif os.path.isdir(path):
            allPaths.append((path, False))
        else:
            print('illegal argument: '+path+' is neither file nor directory', file=sys.stderr)
    obj = {
        "info": [],
        "events": [],
        "h_bars": [],
        "v_bars": [ "auto" ]
    }
    addInfo(obj, "pid", "Patient", id)
    if len(allPaths) == 0:
        print('warning: no path given', file=sys.stderr)
    for (path, isfile) in allPaths:
        if isfile:
            processFile(path, id, obj)
        else:
            processDirectory(path, id, obj)
    min_time = sys.maxint
    max_time = -sys.maxint-1
    for e in obj["events"]:
        time = e["time"]
        if time < min_time:
            min_time = time
        if time > max_time:
            max_time = time
    obj["start"] = min_time
    obj["end"] = max_time
    addInfo(obj, "event_count", "Events", len(obj["events"]))
    file = sys.stdout if output == '-' else output
    if file == sys.stdout:
        print(json.dumps(obj, indent=2), file=file)
    else:
        with open(file, 'w') as ofile:
            print(json.dumps(obj, indent=2), file=ofile)
        ofile.close()
