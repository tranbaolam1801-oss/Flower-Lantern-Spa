import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity({ name: 'KhoaDangNhap' })
export class KhoaDangNhap {
  @PrimaryColumn({ name: 'SoDienThoai', type: 'varchar', length: 15 })
  soDienThoai!: string;

  @Column({ name: 'SoLanSai', type: 'int', default: 0 })
  soLanSai!: number;

  @Column({ name: 'ThoiDiemKhoaDen', type: 'datetime', nullable: true })
  thoiDiemKhoaDen?: Date;

  @Column({ name: 'LanCuoiSai', type: 'datetime', nullable: true })
  lanCuoiSai?: Date;
}
