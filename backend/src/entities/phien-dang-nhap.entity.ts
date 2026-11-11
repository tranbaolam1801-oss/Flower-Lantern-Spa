import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { TaiKhoan } from './tai-khoan.entity';
@Entity({name:'PhienDangNhap'})
export class PhienDangNhap {
  @PrimaryColumn({name:'MaPhien',type:'uniqueidentifier'}) id!:string;
  @Column({name:'MaTaiKhoan',type:'char',length:10}) accountId!:string;
  @Column({name:'TaoLuc',type:'datetime2',precision:3,default:()=> 'SYSUTCDATETIME()'}) createdAt!:Date;
  @Column({name:'HetHanLuc',type:'datetime2',precision:3}) expiresAt!:Date;
  @Column({name:'ThuHoiLuc',type:'datetime2',precision:3,nullable:true}) revokedAt?:Date;
  @ManyToOne(()=>TaiKhoan,{onDelete:'NO ACTION'}) @JoinColumn({name:'MaTaiKhoan'}) account?:TaiKhoan;
}
