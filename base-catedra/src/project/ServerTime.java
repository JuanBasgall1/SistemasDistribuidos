package project;
import java.net.DatagramPacket;
import java.net.InetAddress;
import java.net.DatagramSocket;

import java.util.Date;

class ServerTime {
  public ServerTime(){
      
  }   
    
  public Date GetTime(){
     /* servidores de Time NTP en argentina
       
       server 2.ar.pool.ntp.org
	   server 3.south-america.pool.ntp.org
	   server 2.south-america.pool.ntp.org
       
       Observatorio naval de Bs As  - hora oficial de Arg
       ntp.ign.gob.ar
     */ 
     Date date = new Date();
     try {
         DatagramSocket socket = new DatagramSocket();
         InetAddress address = InetAddress.getByName("ntp.cais.rnp.br");
         byte[] buf = new NTPMessage().toByteArray();
         DatagramPacket packet = new DatagramPacket(buf, buf.length, address, 123);
         socket.send(packet);

         // Get response
         socket.receive(packet);
         byte[] msn = packet.getData();
         NTPMessage ntp = new NTPMessage(msn);
         socket.close();  
         System.out.println( ntp.receiveTimestamp );
      }
      catch(Exception e){
          
      }
      
  return date;     
  }
}