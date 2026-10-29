package project;
import java.util.ArrayList;
import java.util.Date;

class CristianSyncAlgorithm implements SyncAlgorithm {
    
    public CristianSyncAlgorithm(){} 
    
    public void Syncronized(ArrayList<Machine> listamaquinas){
        ServerTime serverhora = new ServerTime();
        Date hora = serverhora.GetTime();
        listamaquinas.forEach((m) -> { m.setTime( hora ); } );
    }
}