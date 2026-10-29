package project;

import java.util.ArrayList;

class SyncronizationSystem {
    
    private ArrayList<Machine> listamaquinas = new ArrayList(); // lista de maquinas a sincronizar
    private SyncAlgorithm sa; // Algoritmo de sincronizacion
    
    public SyncronizationSystem(){}
    
    public void setSyncSysetem(SyncAlgorithm sa  ){
        this.sa = sa;
    }
    
    public void addMachine(Machine m){
        listamaquinas.add(m);
    }
    
    public void Syncronized(){
         sa.Syncronized(listamaquinas);
    }
   
}
