package project;

class MyThread extends Thread{
    static int total=0;
    int i=0;
    String threadName="";
    public MyThread(String str){
        this.threadName=str;
    }
    public void run(){
        for(i=0;i<50;i++){
            System.out.println(this.threadName+" : "+i);
            total+=i;
        }
        System.out.println(this.threadName+" end. total is "+total);
    }
}