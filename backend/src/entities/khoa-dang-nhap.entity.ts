import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity({ schema: 'dbo', name: 'khoadangnhap' })
export class KhoaDangNhap {
  @PrimaryColumn({ name: 'sodienthoai', type: 'varchar', length: 15 })
  soDienThoai!: string;

  @Column({ name: 'solansai', type: 'integer', default: 0 })
  soLanSai!: number;

  @Column({ name: 'thoidiemkhoaden', type: 'timestamp', precision: 3, nullable: true })
  thoiDiemKhoaDen?: Date;

  @Column({ name: 'lancuoisai', type: 'timestamp', precision: 3, nullable: true })
  lanCuoiSai?: Date;
}
