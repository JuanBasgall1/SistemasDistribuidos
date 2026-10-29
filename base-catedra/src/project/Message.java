package project;

import java.io.Serializable;

public class Message implements Serializable {
    static final long serialVersionUID = 00000000;
    private String origen;
    private String destino;
    private String portOirgen;
    private String portDestino;
    private String datos;
    private String flags; // "ACK", "OK"

    public Message(){ }
    public Message(byte[] datos){ }

    public byte [] toArrayByte(){
       String datos = this.origen+this.destino+this.portDestino+this.portDestino+this.flags;
       return datos.getBytes();
    }

    public Message toMessage( byte[] datos){
        // armar el mensaje a partir del array de bytes
        return this;
    }

    public String getFlags(){
        return this.flags;    
    }

    public void setFlags(String tipomensaje ){
       this.flags = tipomensaje;
    } 

}
