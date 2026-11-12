import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { TaiKhoan } from './tai-khoan.entity';
@Entity({ schema: 'dbo', name: 'phiendangnhap' })
export class PhienDangNhap {
  @PrimaryColumn({name: 'maphien',type: 'uuid'}) id!:string;
  @Column({name: 'mataikhoan',type:'char',length:10}) accountId!:string;
  @Column({name: 'taoluc',type: 'timestamp', precision: 3,default: () => 'dbo.utc_now()'}) createdAt!:Date;
  @Column({name: 'hethanluc',type: 'timestamp', precision: 3}) expiresAt!:Date;
  @Column({name: 'thuhoiluc',type: 'timestamp', precision: 3,nullable:true}) revokedAt?:Date;
  @ManyToOne(()=>TaiKhoan,{onDelete:'NO ACTION'}) @JoinColumn({name: 'mataikhoan'}) account?:TaiKhoan;
}
