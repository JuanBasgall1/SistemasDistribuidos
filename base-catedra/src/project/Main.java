package project;

public class Main {

    /**
     * @param args
     */
    public static void main(String[] args) {
        // TODO Auto-generated method stub

       /* SyncronizationSystem ss = new SyncronizationSystem();
 
        Machine m1 = new Machine();
        Machine m2 = new Machine();
        Machine m3 = new Machine();
        
        ss.addMachine(m1);
        ss.addMachine(m2);
        ss.addMachine(m3);
        
        CristianSyncAlgorithm ca = new CristianSyncAlgorithm( );
        ss.setSyncSysetem(ca);
        ss.Syncronized();

        Message ms = new Message();
        ComunicationSystem.Send(ms, m1);
        Message ack =  ComunicationSystem.Receive(m1);
        if(ack.getFlags() == "ACK"){
           Message respuesta = ComunicationSystem.Receive(m1);     
        }


        //ComunicationSystem cs = new ComunicationSystem();
         Message mensajerecibido =  ComunicationSystem.Receive(m1);
         System.out.println(mensajerecibido);
        */
        ComunicationSystem cs = new ComunicationSystem();
        Machine m1 = new Machine();
        Machine m2 = new Machine();
        Message peticion = new Message();
        // aca hay que cargar el mensaje
        peticion.setFlags("PETICION");
        Message respuesta = cs.Peticion(peticion, m1, m2);

    }

}

