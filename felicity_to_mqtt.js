// Node.js >=12
const mqtt = require('mqtt');
const net = require('net');

/**
 * Connect to a TCP server, send a query and collect the response.
 * @param {string} host
 * @param {number} port
 * @param {Buffer|string} query - data to send
 * @param {object} [opts]
 * @param {number} [opts.timeout=5000] - socket timeout in ms
 * @param {string|Buffer} [opts.delimiter] - optional delimiter string; if provided, return when delimiter seen
 * @returns {Promise<{host:string,port:number,ok:boolean,response:Buffer|null,err?:string}>}
 */
function connectAndQuery(host, port, query, opts = {}) {
  const timeout = typeof opts.timeout === 'number' ? opts.timeout : 5000;
  const delimiter = opts.delimiter ? Buffer.from(opts.delimiter) : null;

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let timer = null;
    let received = [];
    let receivedLen = 0;
    let finished = false;

    const cleanup = () => {
      finished = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      // Send Ack to Battery
      socket.write(".")

      socket.removeAllListeners();
      try { socket.end(); } catch (e) {}
      try { socket.destroy(); } catch (e) {}
    };

    const finishOk = (buf) => {
      cleanup();
      resolve({ host, port, ok: true, response: buf });
    };

    const finishErr = (errMsg) => {
      cleanup();
      resolve({ host, port, ok: false, response: null, err: errMsg });
    };

    // Timeout guard (overall)
    timer = setTimeout(() => {
      if (!finished) finishErr(`timeout after ${timeout} ms`);
    }, timeout);

    socket.on('connect', () => {
      // Send the query once connected.
      try {
        socket.write(query);
      } catch (e) {
        finishErr(`write failed: ${e.message || e}`);
      }
    });

    socket.on('data', (chunk) => {
      // collect chunks
      received.push(chunk);
      receivedLen += chunk.length;

      if (delimiter) {
        // check if delimiter is present in concatenated tail
        const bufferSoFar = Buffer.concat(received, receivedLen);
        const idx = bufferSoFar.indexOf(delimiter);
        if (idx !== -1) {
          // include everything up to delimiter (optional: include delimiter or not)
          const answer = bufferSoFar.slice(0, idx);
          finishOk(answer);
        }
      }
      // if no delimiter, we'll wait for 'end' or remote close
    });

    socket.on('end', () => {
      // remote closed connection cleanly -> return collected data
      const buffer = Buffer.concat(received, receivedLen);
      finishOk(buffer);
    });

    socket.on('close', (hadError) => {
      if (!finished) {
        const buffer = Buffer.concat(received, receivedLen);
        // if hadError maybe error event already fired; otherwise return data
        finishOk(buffer);
      }
    });

    socket.on('error', (err) => {
      if (!finished) finishErr(`socket error: ${err.message || err}`);
    });

    socket.connect(port, host);
  });
}


(async function main() {
  // Array mit Batteriesystemen (host, port)
  const servers = [
    { host: '192.168.0.10', port: 53970 }, // Battery System 1
    { host: '192.168.0.11', port: 53970 }, // Battery System 2
  ];
  const MQTT_URL = 'mqtt://127.0.0.1:1886';

  const mqttClient = mqtt.connect(MQTT_URL);

  const query = 'wifilocalMonitor:get dev real infor';

  // Optionen: timeout und optionaler delimiter
  const opts = { timeout: 5000, delimiter: '}' };

  // Parallel alle Server anfragen und Ergebnisse sammeln
  const promises = servers.map(s => connectAndQuery(s.host, s.port, query, opts));

  // Promise.allSettled um alle Resultate zu bekommen, auch bei Fehlern
  const results = await Promise.allSettled(promises);

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const s = servers[i];
    if (r.status === 'fulfilled') {
      const res = r.value;
      if (res.ok) {
        // Antwort an MQTT
        let json;

        try {
          json = JSON.parse((res.response.toString()+'}'));
        } catch (e) {
          // kein gültiges JSON, überspringe Host
          continue;
        }

        mqttClient.publish(s.host.replaceAll('.', '-')+"/CommVer", String(json['CommVer']));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/wifiSN", String(json['wifiSN']));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/modID", String(json['modID']));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/date", String(json['date']));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/DevSN", String(json['DevSN']));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/Type", String(json['Type']));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/SubType", String(json['SubType']));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/Estate", String(json['Estate']));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/Bfault", String(json['Bfault']));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/Bwarn", String(json['Bwarn']));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/Bstate", String(json['Bstate']));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/BBfault", String(json['BBfault']));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/BBwarn", String(json['BBwarn']));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/BTemp1", String(json['BTemp'][0][0]/10));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/BTemp2", String(json['BTemp'][0][1]/10));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/Batt", String(json['Batt'][0][0]/1000));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/Batsoc", String(json['Batsoc'][0][0]/100));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/Templist1", String(json['Templist'][0][0]/10));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/Templist2", String(json['Templist'][0][1]/10));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/BattListVoltage", String(json['BattList'][0][0]/1000));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/BattListAmpere", String(json['BattList'][1][0]/10));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/BatsocList", String(json['BatsocList'][0][0]/100));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/CellVoltage0", String(json['BatcelList'][0][0]/1000));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/CellVoltage1", String(json['BatcelList'][0][1]/1000));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/CellVoltage2", String(json['BatcelList'][0][2]/1000));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/CellVoltage3", String(json['BatcelList'][0][3]/1000));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/CellVoltage4", String(json['BatcelList'][0][4]/1000));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/CellVoltage5", String(json['BatcelList'][0][5]/1000));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/CellVoltage6", String(json['BatcelList'][0][6]/1000));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/CellVoltage7", String(json['BatcelList'][0][7]/1000));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/CellVoltage8", String(json['BatcelList'][0][8]/1000));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/CellVoltage9", String(json['BatcelList'][0][9]/1000));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/CellVoltage10", String(json['BatcelList'][0][10]/1000));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/CellVoltage11", String(json['BatcelList'][0][11]/1000));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/CellVoltage12", String(json['BatcelList'][0][12]/1000));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/CellVoltage13", String(json['BatcelList'][0][13]/1000));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/CellVoltage14", String(json['BatcelList'][0][14]/1000));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/CellVoltage15", String(json['BatcelList'][0][15]/1000));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/EMSpara", String(json['EMSpara'][0][0]));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/CellMaxVoltage", String(json['BMaxMin'][0][0]));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/CellNumberMaxVoltage", String(json['BMaxMin'][1][0]));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/CellMinVoltage", String(json['BMaxMin'][0][1]));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/CellNumberMinVoltage", String(json['BMaxMin'][1][1]));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/LVolCurMax", String(json['LVolCur'][0][0]/10));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/LVolCurMin", String(json['LVolCur'][0][1]/10));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/BMSpara", String(json['BMSpara'][0][0]));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/BLVolCuMax", String(json['BLVolCu'][0][0]/10));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/BLVolCuMin", String(json['BLVolCu'][0][1]/10));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/BtemList1", String(json['BtemList'][0][0]/10));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/BtemList2", String(json['BtemList'][0][1]/10));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/BtemList3", String(json['BtemList'][0][2]/10));
        mqttClient.publish(s.host.replaceAll('.', '-')+"/BtemList4", String(json['BtemList'][0][3]/10));
        
      } else {
        console.error(`-> ${s.host}:${s.port} FEHLER: ${res.err}`);
      }
    } else {
      console.error(`-> ${s.host}:${s.port} Promise rejected: ${r.reason}`);
    }
    if(i == (results.length-1)) {
      //some dirty solution
      setTimeout(function () {
        process.exit(0)
      }, 100)
    }
  }
})();
