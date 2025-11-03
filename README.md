# Felicitysolar-FLA48300-WiFi-Readout
Felicity Solar (FSolar) FLA48300 15 kWh Battery Device has built in WiFi.

## How to connect

You can connect it with default passwort "12345678". You probably will get the IP-Address 192.168.155.2/24 and the battery will have 192.168.155.1/24.

You can connect to TCP Port 192.168.155.1:53970 and send "wifilocalMonitor:get dev real infor" and you will get an answer JSON with Battery data.

## Test

You can test it with netcat:

> echo "wifilocalMonitor:get dev real infor" | nc -v 192.168.155.1 53970

![Screenshot of netcat connection to battery device](/screenshot_netcat.png)

## ToDo

- Connect the battery device to my own WiFi, test if wifilocalMonitor still works
- Test if connection to my WiFi still works, if there is no internet connection
- Test if the battery device disables its own WiFi AP with unsecure default password if connected to my WiFi
