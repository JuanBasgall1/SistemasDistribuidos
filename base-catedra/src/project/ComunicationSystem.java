package project;

import java.net.*;
import java.util.Timer;

public class ComunicationSystem {
   
   private static DatagramSocket DatagramSockSend;
   private static DatagramSocket DatagramSockReceive;
   private Timer time;

   public ComunicationSystem(){ }
    
   public void Send(Message message, Machine machDestino ){
        try {
            DatagramPacket paqueteUDP;
            InetAddress dir_remota = machDestino.getDirIPV4(); // InetAddress.getByName( Destino );
            int portsend = machDestino.getPortSend();
            byte[] buffer = message.toArrayByte(); // retorna los bytes del string
            paqueteUDP = new DatagramPacket(buffer, buffer.length, dir_remota, portsend);
            DatagramSockSend = new DatagramSocket();
            DatagramSockSend.send(paqueteUDP);
            DatagramSockSend.close();
        }
        catch(Exception e){
             
        }
   }   
    
   public Message Receive(Machine machReceive){
       Message msnRet = new Message();;
       int longitdmensaje = 100;
       byte pkg_byte[] = new byte[1];
       try {
           byte buffer[] = new byte[longitdmensaje]; //buffer solo para el DatagramPacket
            DatagramPacket dp = new DatagramPacket( buffer, longitdmensaje);
            int port = machReceive.getPortReceive();
            DatagramSockReceive = new DatagramSocket(port);
            DatagramSockReceive.receive(dp); //lee los datos
            pkg_byte = new byte[dp.getLength()]; //array de bytes para los datos
            pkg_byte = dp.getData(); // asigna los bytes de datos
            msnRet = new Message(pkg_byte);
       }
       catch(Exception e){
           
       }
       return msnRet;
   } 
    
   public Message Peticion(Message peticion, Machine maquinacliente,Machine maquinaserver){
       Message respuesta = new Message();
         // envio del la peticion send
         this.Send(peticion,maquinaserver);
         // esperar el reconocimiento receive
         Message ack = this.Receive(maquinacliente);
         if(ack.getFlags() == "ACK"){
             respuesta = Receive(maquinacliente);
             Message confirmacionrespuesta = new Message();
             confirmacionrespuesta.setFlags("ACK");
             this.Send(confirmacionrespuesta, maquinaserver);
         }
         // esperar la respuesta receive

       return respuesta;
   }

   public void Respuesta(Message respuesta, Machine maquinaserver,Machine maquinacliente){
       Message peticion = Receive(maquinaserver);
       if(peticion.getFlags() == "PETICION"){
           Message ackpeticion = new Message();
           Send(ackpeticion,maquinacliente);
           Send(respuesta, maquinacliente);
           Message ackrespuesta = Receive(maquinacliente);
           if(ackrespuesta.getFlags() == "ACK"){

           }
       } 

   }
    
}