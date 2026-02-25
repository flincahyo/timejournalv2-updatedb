import MetaTrader5 as mt5
import datetime

if not mt5.initialize():
    print("MT5 init failed")
    exit()

date_from = datetime.datetime.now() - datetime.timedelta(days=30)
date_to = datetime.datetime.now()
deals = mt5.history_deals_get(date_from, date_to)

if deals:
    res = []
    for d in deals[-100:]:
        if d.entry == 1:
            comment = getattr(d, 'comment', '').lower()
            reason = getattr(d, 'reason', 0)
            status = 'manually_closed'
            if reason == 4 or 'sl' in comment: status = 'stopped_out'
            elif reason == 5 or 'tp' in comment: status = 'target_hit'
            elif reason == 6 or 'so' in comment: status = 'stopped_out'
            res.append((d.ticket, d.symbol, d.profit, reason, comment, status))
    for r in res[-20:]:
        print(r)

mt5.shutdown()
